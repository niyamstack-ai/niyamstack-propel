package com.niyamstack.propel.lms;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niyamstack.propel.common.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class CodeRunner {
    private static final int MAX_SOURCE = 80_000;
    private static final int MAX_OUTPUT = 32_000;
    private static final Pattern PUBLIC_CLASS = Pattern.compile("public\\s+class\\s+([A-Za-z_][A-Za-z0-9_]*)");
    private static final Pattern ANY_CLASS = Pattern.compile("class\\s+([A-Za-z_][A-Za-z0-9_]*)");

    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final String pistonUrl;
    private final int timeoutSeconds;

    public CodeRunner(
            ObjectMapper json,
            @Value("${app.code.piston-url:}") String pistonUrl,
            @Value("${app.code.timeout-seconds:8}") int timeoutSeconds
    ) {
        this.json = json;
        this.pistonUrl = pistonUrl == null ? "" : pistonUrl.trim();
        this.timeoutSeconds = Math.max(3, timeoutSeconds);
    }

    public List<Map<String, Object>> languages() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Lang lang : Lang.values()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", lang.id);
            row.put("label", lang.label);
            row.put("available", lang == Lang.SQL || !pistonUrl.isBlank() || localReady(lang));
            row.put("hint", lang.hint);
            row.put("starter", lang.starter);
            out.add(row);
        }
        return out;
    }

    public static String inferLanguage(String courseName, String category) {
        String hay = ((courseName == null ? "" : courseName) + " " + (category == null ? "" : category)).toLowerCase(Locale.ROOT);
        if (hay.contains("python") || hay.contains("django") || hay.contains("flask") || hay.contains("pandas")) {
            return "python";
        }
        if (hay.contains("javascript") || hay.contains("node") || hay.contains("react") || hay.contains("typescript") || hay.contains("rest api")) {
            return hay.contains("typescript") ? "typescript" : "javascript";
        }
        if (hay.contains("c++") || hay.contains("cpp")) {
            return "cpp";
        }
        if (hay.contains("c#") || hay.contains("csharp") || hay.contains(".net")) {
            return "csharp";
        }
        if (hay.contains("golang") || hay.matches(".*\\bgo\\b.*")) {
            return "go";
        }
        if (hay.contains("kotlin")) {
            return "kotlin";
        }
        if (hay.contains("rust")) {
            return "rust";
        }
        if (hay.contains("php")) {
            return "php";
        }
        if (hay.contains("ruby") || hay.contains("rails")) {
            return "ruby";
        }
        if (hay.contains("sql") || hay.contains("database") || hay.contains("postgres") || hay.contains("mysql")) {
            return "sql";
        }
        if (hay.contains("java") || hay.contains("spring") || hay.contains("jpa") || hay.contains("jvm") || hay.contains("full stack")) {
            return "java";
        }
        return "python";
    }

    public static String starter(String language) {
        return Lang.from(language).starter;
    }

    public Map<String, Object> run(String language, String source, String stdin) {
        Lang lang = Lang.from(language);
        if (source == null || source.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Write some code first.");
        }
        if (source.length() > MAX_SOURCE) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Program is too long.");
        }
        ExecResult exec = execute(lang, source, stdin == null ? "" : stdin);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("language", lang.id);
        out.put("label", lang.label);
        out.put("stdout", exec.stdout);
        out.put("stderr", exec.stderr);
        out.put("exitCode", exec.exit);
        out.put("timedOut", exec.timedOut);
        out.put("ok", exec.exit == 0 && !exec.timedOut);
        return out;
    }

    public GradeResult grade(String language, String source, String testsJson) {
        List<Case> cases = parseCases(testsJson);
        if (cases.isEmpty()) {
            Map<String, Object> once = run(language, source, "");
            boolean ok = Boolean.TRUE.equals(once.get("ok"));
            return new GradeResult(ok, ok ? 1 : 0, 1, List.of(once));
        }
        Lang lang = Lang.from(language);
        List<Map<String, Object>> details = new ArrayList<>();
        int passed = 0;
        for (Case test : cases) {
            ExecResult exec = execute(lang, source, test.stdin == null ? "" : test.stdin);
            if (lang == Lang.SQL && test.setup != null && !test.setup.isBlank() && exec.exit != 0) {
                exec = executeSql(source, test.setup);
            } else if (lang == Lang.SQL) {
                exec = executeSql(source, test.setup);
            }
            String expected = normalize(test.stdout);
            String actual = normalize(exec.stdout);
            boolean ok = !exec.timedOut && exec.exit == 0 && (expected.isBlank() || expected.equals(actual));
            if (ok) {
                passed++;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("passed", ok);
            row.put("hidden", test.hidden);
            if (!test.hidden) {
                row.put("stdin", test.stdin);
                row.put("expected", test.stdout);
                row.put("stdout", clip(exec.stdout));
                row.put("stderr", clip(exec.stderr));
            }
            details.add(row);
        }
        return new GradeResult(passed == cases.size(), passed, cases.size(), details);
    }

    public List<Case> publicCases(String testsJson) {
        return parseCases(testsJson).stream().filter(c -> !c.hidden).toList();
    }

    private ExecResult execute(Lang lang, String source, String stdin) {
        if (lang == Lang.SQL) {
            return executeSql(source, null);
        }
        if (!pistonUrl.isBlank()) {
            ExecResult remote = piston(lang, source, stdin);
            if (remote != null) {
                return remote;
            }
        }
        if (!localReady(lang)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, lang.label + " is not installed on this server. Set PROPEL_PISTON_URL or install the compiler.");
        }
        return local(lang, source, stdin);
    }

    private ExecResult piston(Lang lang, String source, String stdin) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("language", lang.piston);
            body.put("version", "*");
            body.put("stdin", stdin);
            body.put("files", List.of(Map.of("name", lang.fileName, "content", source)));
            HttpRequest req = HttpRequest.newBuilder(URI.create(pistonUrl.replaceAll("/$", "") + "/api/v2/execute"))
                    .timeout(Duration.ofSeconds(timeoutSeconds + 5))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 400) {
                return null;
            }
            JsonNode root = json.readTree(res.body());
            JsonNode run = root.path("run");
            String stdout = run.path("stdout").asText("");
            String stderr = run.path("stderr").asText("");
            if (root.has("compile")) {
                stderr = root.path("compile").path("stderr").asText("") + stderr;
            }
            return new ExecResult(clip(stdout), clip(stderr), run.path("code").asInt(0), false);
        } catch (Exception e) {
            return null;
        }
    }

    private ExecResult local(Lang lang, String source, String stdin) {
        Path dir = null;
        try {
            dir = Files.createTempDirectory("propel-code-");
            Path file = dir.resolve(lang == Lang.JAVA ? classFileName(source) : lang.fileName);
            Files.writeString(file, source, StandardCharsets.UTF_8);
            if (lang.compile != null) {
                ExecResult compiled = process(lang.compile.apply(file, dir), dir, "", timeoutSeconds);
                if (compiled.exit != 0 || compiled.timedOut) {
                    return compiled;
                }
            }
            return process(lang.run(file, dir), dir, stdin, timeoutSeconds);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            return new ExecResult("", e.getMessage(), 1, false);
        } finally {
            wipe(dir);
        }
    }

    private ExecResult executeSql(String source, String setup) {
        String url = "jdbc:h2:mem:code_" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
        try (Connection c = DriverManager.getConnection(url, "sa", "")) {
            try (Statement st = c.createStatement()) {
                if (setup != null && !setup.isBlank()) {
                    for (String part : setup.split(";")) {
                        if (!part.isBlank()) {
                            st.execute(part);
                        }
                    }
                }
                boolean hasResult = st.execute(source);
                if (!hasResult) {
                    return new ExecResult(st.getUpdateCount() + " row(s)", "", 0, false);
                }
                return new ExecResult(resultCsv(st.getResultSet()), "", 0, false);
            }
        } catch (Exception e) {
            return new ExecResult("", e.getMessage(), 1, false);
        }
    }

    private static String resultCsv(ResultSet rs) throws Exception {
        StringBuilder out = new StringBuilder();
        ResultSetMetaData meta = rs.getMetaData();
        int cols = meta.getColumnCount();
        while (rs.next()) {
            if (out.length() > 0) {
                out.append('\n');
            }
            for (int i = 1; i <= cols; i++) {
                if (i > 1) {
                    out.append('\t');
                }
                Object v = rs.getObject(i);
                out.append(v == null ? "NULL" : String.valueOf(v));
            }
        }
        return out.toString();
    }

    private ExecResult process(List<String> command, Path dir, String stdin, int seconds) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(dir.toFile());
        pb.redirectErrorStream(true);
        Process proc = pb.start();
        if (stdin != null && !stdin.isEmpty()) {
            proc.getOutputStream().write(stdin.getBytes(StandardCharsets.UTF_8));
        }
        proc.getOutputStream().close();
        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
        Thread drain = new Thread(() -> {
            try {
                proc.getInputStream().transferTo(buf);
            } catch (Exception ignored) {
                /* closed */
            }
        });
        drain.setDaemon(true);
        drain.start();
        boolean finished = proc.waitFor(seconds, TimeUnit.SECONDS);
        if (!finished) {
            proc.destroyForcibly();
            drain.join(400);
            return new ExecResult("", "Time limit exceeded.", 124, true);
        }
        drain.join(400);
        return new ExecResult(clip(buf.toString(StandardCharsets.UTF_8)), "", proc.exitValue(), false);
    }

    private boolean localReady(Lang lang) {
        if (lang == Lang.SQL) {
            return true;
        }
        return lang.detect.stream().anyMatch(CodeRunner::onPath);
    }

    private static boolean onPath(String bin) {
        try {
            boolean win = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
            ProcessBuilder pb = win
                    ? new ProcessBuilder("cmd", "/c", "where", bin)
                    : new ProcessBuilder("which", bin);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            boolean done = p.waitFor(2, TimeUnit.SECONDS);
            return done && p.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    private static String classFileName(String source) {
        Matcher pub = PUBLIC_CLASS.matcher(source);
        if (pub.find()) {
            return pub.group(1) + ".java";
        }
        Matcher any = ANY_CLASS.matcher(source);
        if (any.find()) {
            return any.group(1) + ".java";
        }
        return "Main.java";
    }

    private static String className(Path file) {
        String name = file.getFileName().toString();
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private List<Case> parseCases(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        try {
            List<Case> rows = json.readValue(raw, new TypeReference<>() {});
            return rows == null ? List.of() : rows;
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String normalize(String s) {
        return s == null ? "" : s.replace("\r\n", "\n").strip();
    }

    private static String clip(String s) {
        if (s == null) {
            return "";
        }
        return s.length() <= MAX_OUTPUT ? s : s.substring(0, MAX_OUTPUT) + "\n…";
    }

    private static void wipe(Path dir) {
        if (dir == null) {
            return;
        }
        try (var walk = Files.walk(dir)) {
            walk.sorted((a, b) -> b.compareTo(a)).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (Exception ignored) {
                    /* temp */
                }
            });
        } catch (Exception ignored) {
            /* temp */
        }
    }

    public record GradeResult(boolean passed, int passedCount, int total, List<Map<String, Object>> cases) {}

    private record ExecResult(String stdout, String stderr, int exit, boolean timedOut) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Case {
        public String stdin;
        public String stdout;
        public String setup;
        public boolean hidden;
    }

    private enum Lang {
        JAVA("java", "Java", "java", "Main.java", "Print to stdout. Class name Main unless you declare a public class.",
                List.of("javac", "java"),
                """
                public class Main {
                  public static void main(String[] args) {
                    System.out.println("Hello");
                  }
                }
                """),
        PYTHON("python", "Python", "python", "main.py", "Print the answer. Input comes from stdin.",
                List.of("python", "python3", "py"),
                "print('Hello')\n"),
        JAVASCRIPT("javascript", "JavaScript (Node)", "javascript", "main.js", "Node.js. Use console.log.",
                List.of("node"),
                "console.log('Hello');\n"),
        TYPESCRIPT("typescript", "TypeScript", "typescript", "main.ts", "TypeScript via ts-node or Piston.",
                List.of("ts-node", "npx"),
                "console.log('Hello');\n"),
        C("c", "C", "c", "main.c", "Read stdin, print stdout.",
                List.of("gcc"),
                """
                #include <stdio.h>
                int main() {
                  printf("Hello\\n");
                  return 0;
                }
                """),
        CPP("cpp", "C++", "c++", "main.cpp", "Read stdin, print stdout.",
                List.of("g++"),
                """
                #include <iostream>
                int main() {
                  std::cout << "Hello\\n";
                  return 0;
                }
                """),
        CSHARP("csharp", "C#", "csharp", "Main.cs", "dotnet or Piston.",
                List.of("dotnet", "csc"),
                """
                using System;
                class Program {
                  static void Main() {
                    Console.WriteLine("Hello");
                  }
                }
                """),
        GO("go", "Go", "go", "main.go", "go run.",
                List.of("go"),
                """
                package main
                import "fmt"
                func main() { fmt.Println("Hello") }
                """),
        PHP("php", "PHP", "php", "main.php", "php CLI.",
                List.of("php"),
                "<?php echo \"Hello\\n\";\n"),
        RUBY("ruby", "Ruby", "ruby", "main.rb", "ruby CLI.",
                List.of("ruby"),
                "puts 'Hello'\n"),
        KOTLIN("kotlin", "Kotlin", "kotlin", "Main.kt", "kotlinc or Piston.",
                List.of("kotlinc", "kotlin"),
                "fun main() { println(\"Hello\") }\n"),
        RUST("rust", "Rust", "rust", "main.rs", "rustc or Piston.",
                List.of("rustc"),
                "fn main() { println!(\"Hello\"); }\n"),
        SQL("sql", "SQL", "sqlite3", "query.sql", "Runs against an in-memory H2/Postgres-mode database.",
                List.of(),
                "SELECT 1 AS n;\n"),
        BASH("bash", "Bash", "bash", "main.sh", "bash (or Piston).",
                List.of("bash"),
                "echo Hello\n");

        final String id;
        final String label;
        final String piston;
        final String fileName;
        final String hint;
        final List<String> detect;
        final String starter;
        final Compile compile;

        Lang(String id, String label, String piston, String fileName, String hint, List<String> detect, String starter) {
            this.id = id;
            this.label = label;
            this.piston = piston;
            this.fileName = fileName;
            this.hint = hint;
            this.detect = detect;
            this.starter = starter;
            this.compile = switch (id) {
                case "java" -> (file, dir) -> List.of("javac", file.getFileName().toString());
                case "c" -> (file, dir) -> List.of("gcc", file.getFileName().toString(), "-o", dir.resolve("a.out").toString());
                case "cpp" -> (file, dir) -> List.of("g++", file.getFileName().toString(), "-o", dir.resolve("a.out").toString());
                case "rust" -> (file, dir) -> List.of("rustc", file.getFileName().toString(), "-o", dir.resolve("a.out").toString());
                default -> null;
            };
        }

        List<String> run(Path file, Path dir) {
            return switch (this) {
                case JAVA -> List.of("java", "-cp", ".", className(file));
                case PYTHON -> pythonCmd(file);
                case JAVASCRIPT -> List.of("node", file.getFileName().toString());
                case TYPESCRIPT -> List.of("npx", "--yes", "ts-node", file.getFileName().toString());
                case C, CPP, RUST -> List.of(dir.resolve("a.out").toString());
                case CSHARP -> List.of("dotnet", "script", file.getFileName().toString());
                case GO -> List.of("go", "run", file.getFileName().toString());
                case PHP -> List.of("php", file.getFileName().toString());
                case RUBY -> List.of("ruby", file.getFileName().toString());
                case KOTLIN -> List.of("kotlinc", "-script", file.getFileName().toString());
                case BASH -> List.of("bash", file.getFileName().toString());
                case SQL -> List.of("sql");
            };
        }

        interface Compile {
            List<String> apply(Path file, Path dir);
        }

        static Lang from(String raw) {
            if (raw == null || raw.isBlank()) {
                return PYTHON;
            }
            String id = raw.trim().toLowerCase(Locale.ROOT);
            for (Lang lang : values()) {
                if (lang.id.equals(id) || lang.piston.equals(id) || lang.label.equalsIgnoreCase(raw)) {
                    return lang;
                }
            }
            if (id.contains("java")) return JAVA;
            if (id.contains("py")) return PYTHON;
            if (id.contains("node") || id.contains("js")) return JAVASCRIPT;
            if (id.contains("ts")) return TYPESCRIPT;
            if (id.contains("c++")) return CPP;
            return PYTHON;
        }

        private static List<String> pythonCmd(Path file) {
            if (onPath("python")) {
                return List.of("python", file.getFileName().toString());
            }
            if (onPath("python3")) {
                return List.of("python3", file.getFileName().toString());
            }
            return List.of("py", "-3", file.getFileName().toString());
        }
    }
}

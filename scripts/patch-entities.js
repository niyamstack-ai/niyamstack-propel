const fs = require("fs");
const p = "backend/src/main/java/com/niyamstack/propel/domain/Model.java";
let s = fs.readFileSync(p, "utf8");
s = s.replace(
  /@Entity(?:\(name = "[^"]+"\))? @Table\(name = "([^"]+)"\) @Getter @Setter\r?\n    public static class (\w+)/g,
  '@Entity(name = "$2") @Table(name = "$1") @Getter @Setter\n    public static class $2'
);
fs.writeFileSync(p, s);
console.log("patched entity names");

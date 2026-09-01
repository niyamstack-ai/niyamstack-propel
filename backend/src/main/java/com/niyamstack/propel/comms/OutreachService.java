package com.niyamstack.propel.comms;

import com.niyamstack.propel.data.Store;
import com.niyamstack.propel.domain.Model.Announcement;
import com.niyamstack.propel.domain.Model.AppPush;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Campaign;
import com.niyamstack.propel.domain.Model.Notification;
import com.niyamstack.propel.domain.Model.Student;
import com.niyamstack.propel.integration.EventHook;
import com.niyamstack.propel.integration.MessagingGateway;
import com.niyamstack.propel.security.Access;
import com.niyamstack.propel.security.Auth;
import com.niyamstack.propel.security.PropelUser;
import com.niyamstack.propel.security.Roles;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class OutreachService {
    private final Store store;
    private final MessagingGateway messaging;
    private final EventHook hooks;

    public OutreachService(Store store, MessagingGateway messaging, EventHook hooks) {
        this.store = store;
        this.messaging = messaging;
        this.hooks = hooks;
    }

    @Transactional
    public Map<String, Object> sendNotice(String channel, String title, String body) {
        return sendNotice(channel, title, body, null);
    }

    @Transactional
    public Map<String, Object> sendNotice(String channel, String title, String body, UUID batchId) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.FACULTY, Roles.COUNSELOR, Roles.PLACEMENT_HEAD);
        String ch = channel == null || channel.isBlank() ? "IN_APP" : channel.toUpperCase();
        List<Student> targets = studentsForNotice(user.organizationId(), batchId);
        Delivery d;
        if ("IN_APP".equals(ch)) {
            int n = targets.size();
            d = new Delivery(n, 0, 0, batchId == null
                    ? "Shown to " + n + " student(s) on the website."
                    : "Shown to " + n + " student(s) in the selected batch.");
        } else {
            d = deliver(user.organizationId(), ch, title, body, targets);
        }
        if (batchId != null) {
            Announcement ann = new Announcement();
            ann.setOrganizationId(user.organizationId());
            ann.setBatchId(batchId);
            ann.setTitle(title);
            ann.setBody(body);
            store.save(ann);
        }
        Notification n = new Notification();
        n.setOrganizationId(user.organizationId());
        n.setChannel(ch);
        n.setAudience("STUDENTS");
        n.setTitle(title);
        n.setBody(body);
        n.setStatus(d.status());
        n.setDetail(d.detail());
        store.save(n);
        hooks.fire(user.organizationId(), "notice.sent", Map.of("title", title == null ? "" : title, "channel", ch, "sent", d.sent));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sent", d.sent);
        out.put("queued", d.queued);
        out.put("failed", d.failed);
        out.put("status", n.getStatus());
        out.put("detail", n.getDetail());
        return out;
    }

    @Transactional
    public Campaign launch(UUID campaignId) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.COUNSELOR);
        Campaign campaign = store.getOwned(Campaign.class, campaignId, user.organizationId());
        String ch = campaign.getChannel() == null ? "WHATSAPP" : campaign.getChannel().toUpperCase();
        if ("PUSH".equals(ch)) {
            ch = "WHATSAPP";
        }
        Delivery d = deliver(user.organizationId(), ch, campaign.getTitle(), campaign.getBody(), studentsForNotice(user.organizationId(), null));
        campaign.setStatus("LIVE");
        campaign.setSentCount((campaign.getSentCount() == null ? 0 : campaign.getSentCount()) + d.sent);
        campaign.setLastSendStatus(d.status());
        campaign.setLastSendDetail(d.detail());
        store.save(campaign);
        hooks.fire(user.organizationId(), "campaign.sent", Map.of("name", campaign.getName() == null ? "" : campaign.getName(), "sent", d.sent));
        return campaign;
    }

    @Transactional
    public AppPush sendPush(String title, String body, String audience) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER);
        int inApp = 0;
        for (Student student : store.list(Student.class, user.organizationId())) {
            if (student.getStatus() != null && ("DROPPED".equals(student.getStatus()) || "INACTIVE".equals(student.getStatus()))) {
                continue;
            }
            Notification n = new Notification();
            n.setOrganizationId(user.organizationId());
            n.setStudentId(student.getId());
            n.setChannel("PUSH");
            n.setAudience(audience == null ? "STUDENTS" : audience);
            n.setTitle(title);
            n.setBody(body);
            n.setStatus("SENT");
            n.setDetail("Shown in the student app and notices.");
            store.save(n);
            inApp++;
        }
        Delivery d = deliver(user.organizationId(), "WHATSAPP", title, body, studentsForNotice(user.organizationId(), null));
        AppPush push = new AppPush();
        push.setOrganizationId(user.organizationId());
        push.setTitle(title);
        push.setBody(body);
        push.setAudience(audience == null ? "STUDENTS" : audience);
        push.setStatus(inApp > 0 ? "SENT" : d.status());
        push.setScheduledAt(Instant.now());
        push.setSentAt(Instant.now());
        return store.save(push);
    }

    private record Delivery(int sent, int queued, int failed, String detail) {
        String status() {
            if (sent > 0) {
                return "SENT";
            }
            if (failed > 0 && queued == 0) {
                return "FAILED";
            }
            return "QUEUED";
        }
    }

    private List<Student> studentsForNotice(UUID orgId, UUID batchId) {
        return store.list(Student.class, orgId).stream()
                .filter(s -> s.getStatus() == null || (!"DROPPED".equals(s.getStatus()) && !"INACTIVE".equals(s.getStatus())))
                .filter(s -> batchId == null || batchId.equals(s.getBatchId()))
                .toList();
    }

    private Delivery deliver(UUID orgId, String channel, String title, String body, List<Student> students) {
        int sent = 0;
        int queued = 0;
        int failed = 0;
        String lastMessage = "";
        for (Student student : students) {
            String to;
            String ch = channel;
            if ("EMAIL".equals(ch)) {
                to = student.getEmail();
            } else {
                to = student.getPhone() != null && !student.getPhone().isBlank() ? student.getPhone() : student.getEmail();
                if (to != null && to.contains("@")) {
                    ch = "EMAIL";
                }
            }
            if (to == null || to.isBlank()) {
                if (student.getUserId() == null) {
                    continue;
                }
                try {
                    AppUser appUser = store.get(AppUser.class, student.getUserId());
                    to = appUser.getPhone() != null && !appUser.getPhone().isBlank() ? appUser.getPhone() : appUser.getEmail();
                } catch (Exception ignored) {
                    continue;
                }
            }
            if (to == null || to.isBlank()) {
                continue;
            }
            var result = messaging.send(orgId, ch, to, title == null ? "Notice" : title, body == null ? "" : body);
            lastMessage = result.message() == null ? "" : result.message();
            if ("SENT".equals(result.status())) {
                sent++;
            } else if (result.queued()) {
                queued++;
            } else {
                failed++;
            }
        }
        String detail;
        if (sent > 0) {
            detail = "Sent to " + sent + " student(s).";
        } else if (queued > 0) {
            detail = lastMessage.isBlank()
                    ? "Queued. Connect WhatsApp or email in Integrations, then send again."
                    : lastMessage + " (" + queued + " recipient(s)).";
        } else if (failed > 0) {
            detail = lastMessage.isBlank() ? "Send failed." : lastMessage;
        } else {
            detail = "No students to send to.";
        }
        return new Delivery(sent, queued, failed, detail);
    }
}

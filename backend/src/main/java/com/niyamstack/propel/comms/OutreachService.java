package com.niyamstack.propel.comms;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.data.Store;
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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
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
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER, Roles.FACULTY, Roles.COUNSELOR, Roles.PLACEMENT_HEAD);
        String ch = channel == null || channel.isBlank() ? "IN_APP" : channel.toUpperCase();
        int sent;
        if ("IN_APP".equals(ch)) {
            sent = (int) store.list(Student.class, user.organizationId()).stream()
                    .filter(s -> s.getStatus() == null || (!"DROPPED".equals(s.getStatus()) && !"INACTIVE".equals(s.getStatus())))
                    .count();
        } else {
            sent = deliver(user.organizationId(), ch, title, body);
        }
        Notification n = new Notification();
        n.setOrganizationId(user.organizationId());
        n.setChannel(ch);
        n.setAudience("STUDENTS");
        n.setTitle(title);
        n.setBody(body);
        n.setStatus(sent > 0 ? "SENT" : "QUEUED");
        store.save(n);
        hooks.fire(user.organizationId(), "notice.sent", Map.of("title", title == null ? "" : title, "channel", ch, "sent", sent));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sent", sent);
        out.put("status", n.getStatus());
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
        int sent = deliver(user.organizationId(), ch, campaign.getTitle(), campaign.getBody());
        campaign.setStatus("LIVE");
        campaign.setSentCount((campaign.getSentCount() == null ? 0 : campaign.getSentCount()) + sent);
        store.save(campaign);
        hooks.fire(user.organizationId(), "campaign.sent", Map.of("name", campaign.getName() == null ? "" : campaign.getName(), "sent", sent));
        return campaign;
    }

    @Transactional
    public AppPush sendPush(String title, String body, String audience) {
        PropelUser user = Auth.current();
        Access.requireAny(user, Roles.OWNER);
        int sent = deliver(user.organizationId(), "WHATSAPP", title, body);
        AppPush push = new AppPush();
        push.setOrganizationId(user.organizationId());
        push.setTitle(title);
        push.setBody(body);
        push.setAudience(audience == null ? "STUDENTS" : audience);
        push.setStatus(sent > 0 ? "SENT" : "QUEUED");
        push.setScheduledAt(Instant.now());
        push.setSentAt(Instant.now());
        return store.save(push);
    }

    private int deliver(UUID orgId, String channel, String title, String body) {
        int sent = 0;
        for (Student student : store.list(Student.class, orgId)) {
            if (student.getStatus() != null && ("DROPPED".equals(student.getStatus()) || "INACTIVE".equals(student.getStatus()))) {
                continue;
            }
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
            if (result.queued() || "SENT".equals(result.status())) {
                sent++;
            }
        }
        return sent;
    }
}

package com.niyamstack.propel.data;

import com.niyamstack.propel.common.ApiException;
import com.niyamstack.propel.domain.BaseEntity;
import com.niyamstack.propel.domain.Model.AppUser;
import com.niyamstack.propel.domain.Model.Organization;
import com.niyamstack.propel.domain.Model.PlatformRole;
import com.niyamstack.propel.domain.Model.PlatformSetting;
import com.niyamstack.propel.domain.Model.PlatformUserRole;
import com.niyamstack.propel.domain.TenantEntity;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Repository
public class Store {
    @PersistenceContext
    private EntityManager em;

    public <T> T get(Class<T> type, UUID id) {
        T entity = em.find(type, id);
        if (entity == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, type.getSimpleName() + " not found");
        }
        return entity;
    }

    public <T extends TenantEntity> T getOwned(Class<T> type, UUID id, UUID orgId) {
        T entity = get(type, id);
        if (orgId == null || !orgId.equals(entity.getOrganizationId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, type.getSimpleName() + " not found");
        }
        return entity;
    }

    public <T extends TenantEntity> List<T> list(Class<T> type, UUID orgId) {
        return em.createQuery(
                        "select e from " + type.getSimpleName() + " e where e.organizationId = :o order by e.createdAt desc",
                        type)
                .setParameter("o", orgId)
                .setMaxResults(500)
                .getResultList();
    }

    public <T extends TenantEntity> List<T> listBy(Class<T> type, UUID orgId, String field, Object value) {
        assertSafeField(field);
        return em.createQuery(
                        "select e from " + type.getSimpleName() + " e where e.organizationId = :o and e." + field + " = :v order by e.createdAt desc",
                        type)
                .setParameter("o", orgId)
                .setParameter("v", value)
                .setMaxResults(500)
                .getResultList();
    }

    public List<Organization> listOrganizations() {
        return em.createQuery("select o from Organization o order by o.createdAt desc", Organization.class)
                .setMaxResults(500)
                .getResultList();
    }

    public List<AppUser> listPlatformUsers() {
        return em.createQuery(
                        "select u from AppUser u where u.organizationId is null order by u.createdAt desc",
                        AppUser.class)
                .setMaxResults(200)
                .getResultList();
    }

    public List<PlatformRole> listPlatformRoles() {
        return em.createQuery("select r from PlatformRole r order by r.name", PlatformRole.class).getResultList();
    }

    public List<PlatformUserRole> listUserRoles(UUID userId) {
        return em.createQuery("select r from PlatformUserRole r where r.userId = :u", PlatformUserRole.class)
                .setParameter("u", userId)
                .getResultList();
    }

    public long countUsersWithRole(UUID roleId) {
        return em.createQuery("select count(r) from PlatformUserRole r where r.roleId = :r", Long.class)
                .setParameter("r", roleId)
                .getSingleResult();
    }

    @Transactional
    public void deleteUserRoles(UUID userId) {
        em.createQuery("delete from PlatformUserRole r where r.userId = :u")
                .setParameter("u", userId)
                .executeUpdate();
    }

    public PlatformSetting findSetting(String key) {
        List<PlatformSetting> rows = em.createQuery(
                        "select s from PlatformSetting s where s.settingKey = :k",
                        PlatformSetting.class)
                .setParameter("k", key)
                .setMaxResults(1)
                .getResultList();
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public AppUser findUserByEmail(String email) {
        List<AppUser> users = em.createQuery("select u from AppUser u where lower(u.email) = lower(:e)", AppUser.class)
                .setParameter("e", email)
                .setMaxResults(1)
                .getResultList();
        return users.isEmpty() ? null : users.getFirst();
    }

    public AppUser findUserByPhone(String phone) {
        List<AppUser> users = em.createQuery("select u from AppUser u where u.phone = :p", AppUser.class)
                .setParameter("p", phone)
                .setMaxResults(1)
                .getResultList();
        return users.isEmpty() ? null : users.getFirst();
    }

    public boolean slugTaken(String slug) {
        try {
            Long n = em.createQuery("select count(o) from Organization o where o.slug = :s", Long.class)
                    .setParameter("s", slug)
                    .getSingleResult();
            return n != null && n > 0;
        } catch (RuntimeException ex) {
            return false;
        }
    }

    public long countUsers() {
        return em.createQuery("select count(u) from AppUser u", Long.class).getSingleResult();
    }

    @Transactional
    public <T> T save(T entity) {
        if (entity instanceof BaseEntity base && (base.getId() == null || em.find(entity.getClass(), base.getId()) == null)) {
            em.persist(entity);
            return entity;
        }
        return em.merge(entity);
    }

    @Transactional
    public void deleteOwned(Class<? extends TenantEntity> type, UUID id, UUID orgId) {
        TenantEntity entity = getOwned(type, id, orgId);
        em.remove(entity);
    }

    public EntityManager em() {
        return em;
    }

    private static void assertSafeField(String field) {
        if (field == null || !field.matches("[a-zA-Z][a-zA-Z0-9]*")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid filter");
        }
    }
}

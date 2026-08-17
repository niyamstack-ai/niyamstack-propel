package com.niyamstack.propel.domain;

import jakarta.persistence.MappedSuperclass;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@MappedSuperclass
public abstract class TenantEntity extends BaseEntity {
    private UUID organizationId;
}

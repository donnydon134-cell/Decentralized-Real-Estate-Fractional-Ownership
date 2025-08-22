// PropertyRegistry.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface PropertyRecord {
  owner: string;
  timestamp: number;
  address: string;
  value: number;
  rentalIncome: number;
  description: string;
  active: boolean;
}

interface CategoryRecord {
  category: string;
  tags: string[];
}

interface StatusRecord {
  status: string;
  visibility: boolean;
  lastUpdated: number;
}

interface CollaboratorRecord {
  role: string;
  permissions: string[];
  addedAt: number;
}

interface RevenueShareRecord {
  percentage: number;
  totalReceived: number;
}

interface LeaseRecord {
  expiry: number;
  terms: string;
  active: boolean;
}

interface VersionRecord {
  updatedValue: number;
  updateNotes: string;
  timestamp: number;
}

interface ContractState {
  propertyRegistry: Map<number, PropertyRecord>;
  propertyCategories: Map<number, CategoryRecord>;
  propertyStatus: Map<number, StatusRecord>;
  collaborators: Map<string, CollaboratorRecord>; // Key: `${propertyId}-${collaborator}`
  revenueShares: Map<string, RevenueShareRecord>; // Key: `${propertyId}-${participant}`
  leases: Map<string, LeaseRecord>; // Key: `${propertyId}-${lessee}`
  versionHistory: Map<string, VersionRecord>; // Key: `${propertyId}-${version}`
  nextPropertyId: number;
  blockHeight: number; // Mock block height
}

// Mock contract implementation
class PropertyRegistryMock {
  private state: ContractState = {
    propertyRegistry: new Map(),
    propertyCategories: new Map(),
    propertyStatus: new Map(),
    collaborators: new Map(),
    revenueShares: new Map(),
    leases: new Map(),
    versionHistory: new Map(),
    nextPropertyId: 1,
    blockHeight: 1000,
  };

  private ERR_ALREADY_REGISTERED = 1;
  private ERR_UNAUTHORIZED = 2;
  private ERR_INVALID_PARAMS = 3;
  private ERR_NOT_FOUND = 4;
  private ERR_EXPIRED = 5;
  private ERR_INVALID_PERCENTAGE = 6;
  private MAX_METADATA_LEN = 500;

  // Mock block-height
  private incrementBlockHeight() {
    this.state.blockHeight += 1;
  }

  registerProperty(
    caller: string,
    address: string,
    value: number,
    rentalIncome: number,
    description: string
  ): ClarityResponse<number> {
    const propertyId = this.state.nextPropertyId;
    if (this.state.propertyRegistry.has(propertyId)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    if (value <= 0 || description.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_INVALID_PARAMS };
    }
    this.state.propertyRegistry.set(propertyId, {
      owner: caller,
      timestamp: this.state.blockHeight,
      address,
      value,
      rentalIncome,
      description,
      active: true,
    });
    this.state.propertyStatus.set(propertyId, {
      status: "pending",
      visibility: true,
      lastUpdated: this.state.blockHeight,
    });
    this.state.nextPropertyId += 1;
    this.incrementBlockHeight();
    return { ok: true, value: propertyId };
  }

  updatePropertyDetails(
    caller: string,
    propertyId: number,
    newAddress?: string,
    newValue?: number,
    newRentalIncome?: number,
    newDescription?: string
  ): ClarityResponse<boolean> {
    const property = this.state.propertyRegistry.get(propertyId);
    if (!property) {
      return { ok: false, value: this.ERR_NOT_FOUND };
    }
    if (property.owner !== caller) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    const updated = {
      ...property,
      address: newAddress ?? property.address,
      value: newValue ?? property.value,
      rentalIncome: newRentalIncome ?? property.rentalIncome,
      description: newDescription ?? property.description,
    };
    this.state.propertyRegistry.set(propertyId, updated);
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  addPropertyCategory(
    caller: string,
    propertyId: number,
    category: string,
    tags: string[]
  ): ClarityResponse<boolean> {
    const property = this.state.propertyRegistry.get(propertyId);
    if (!property || property.owner !== caller) {
      return { ok: false, value: property ? this.ERR_UNAUTHORIZED : this.ERR_NOT_FOUND };
    }
    this.state.propertyCategories.set(propertyId, { category, tags });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  updatePropertyStatus(
    caller: string,
    propertyId: number,
    status: string,
    visibility: boolean
  ): ClarityResponse<boolean> {
    const property = this.state.propertyRegistry.get(propertyId);
    if (!property) {
      return { ok: false, value: this.ERR_NOT_FOUND };
    }
    const isOwner = property.owner === caller;
    const collabKey = `${propertyId}-${caller}`;
    const hasPerm = this.state.collaborators.get(collabKey)?.permissions.includes("update-status") ?? false;
    if (!isOwner && !hasPerm) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.propertyStatus.set(propertyId, {
      status,
      visibility,
      lastUpdated: this.state.blockHeight,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  addCollaborator(
    caller: string,
    propertyId: number,
    collaborator: string,
    role: string,
    permissions: string[]
  ): ClarityResponse<boolean> {
    const property = this.state.propertyRegistry.get(propertyId);
    if (!property || property.owner !== caller) {
      return { ok: false, value: property ? this.ERR_UNAUTHORIZED : this.ERR_NOT_FOUND };
    }
    const key = `${propertyId}-${collaborator}`;
    this.state.collaborators.set(key, {
      role,
      permissions,
      addedAt: this.state.blockHeight,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  setRevenueShare(
    caller: string,
    propertyId: number,
    participant: string,
    sharePercentage: number
  ): ClarityResponse<boolean> {
    const property = this.state.propertyRegistry.get(propertyId);
    if (!property || property.owner !== caller) {
      return { ok: false, value: property ? this.ERR_UNAUTHORIZED : this.ERR_NOT_FOUND };
    }
    if (sharePercentage > 100) {
      return { ok: false, value: this.ERR_INVALID_PERCENTAGE };
    }
    const key = `${propertyId}-${participant}`;
    this.state.revenueShares.set(key, {
      percentage: sharePercentage,
      totalReceived: 0,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  grantLease(
    caller: string,
    propertyId: number,
    lessee: string,
    duration: number,
    terms: string
  ): ClarityResponse<boolean> {
    const property = this.state.propertyRegistry.get(propertyId);
    if (!property || property.owner !== caller) {
      return { ok: false, value: property ? this.ERR_UNAUTHORIZED : this.ERR_NOT_FOUND };
    }
    const key = `${propertyId}-${lessee}`;
    this.state.leases.set(key, {
      expiry: this.state.blockHeight + duration,
      terms,
      active: true,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  registerNewVersion(
    caller: string,
    propertyId: number,
    newValue: number,
    version: number,
    notes: string
  ): ClarityResponse<boolean> {
    const property = this.state.propertyRegistry.get(propertyId);
    if (!property || property.owner !== caller) {
      return { ok: false, value: property ? this.ERR_UNAUTHORIZED : this.ERR_NOT_FOUND };
    }
    const key = `${propertyId}-${version}`;
    this.state.versionHistory.set(key, {
      updatedValue: newValue,
      updateNotes: notes,
      timestamp: this.state.blockHeight,
    });
    const updatedProperty = { ...property, value: newValue };
    this.state.propertyRegistry.set(propertyId, updatedProperty);
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  transferOwnership(
    caller: string,
    propertyId: number,
    newOwner: string
  ): ClarityResponse<boolean> {
    const property = this.state.propertyRegistry.get(propertyId);
    if (!property || property.owner !== caller) {
      return { ok: false, value: property ? this.ERR_UNAUTHORIZED : this.ERR_NOT_FOUND };
    }
    const updated = { ...property, owner: newOwner };
    this.state.propertyRegistry.set(propertyId, updated);
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  deactivateProperty(
    caller: string,
    propertyId: number
  ): ClarityResponse<boolean> {
    const property = this.state.propertyRegistry.get(propertyId);
    if (!property || property.owner !== caller) {
      return { ok: false, value: property ? this.ERR_UNAUTHORIZED : this.ERR_NOT_FOUND };
    }
    const updated = { ...property, active: false };
    this.state.propertyRegistry.set(propertyId, updated);
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  getPropertyDetails(propertyId: number): ClarityResponse<PropertyRecord | null> {
    return { ok: true, value: this.state.propertyRegistry.get(propertyId) ?? null };
  }

  getPropertyCategory(propertyId: number): ClarityResponse<CategoryRecord | null> {
    return { ok: true, value: this.state.propertyCategories.get(propertyId) ?? null };
  }

  getPropertyStatus(propertyId: number): ClarityResponse<StatusRecord | null> {
    return { ok: true, value: this.state.propertyStatus.get(propertyId) ?? null };
  }

  getCollaborator(propertyId: number, collaborator: string): ClarityResponse<CollaboratorRecord | null> {
    const key = `${propertyId}-${collaborator}`;
    return { ok: true, value: this.state.collaborators.get(key) ?? null };
  }

  getRevenueShare(propertyId: number, participant: string): ClarityResponse<RevenueShareRecord | null> {
    const key = `${propertyId}-${participant}`;
    return { ok: true, value: this.state.revenueShares.get(key) ?? null };
  }

  getLease(propertyId: number, lessee: string): ClarityResponse<LeaseRecord | null> {
    const key = `${propertyId}-${lessee}`;
    return { ok: true, value: this.state.leases.get(key) ?? null };
  }

  getVersionHistory(propertyId: number, version: number): ClarityResponse<VersionRecord | null> {
    const key = `${propertyId}-${version}`;
    return { ok: true, value: this.state.versionHistory.get(key) ?? null };
  }

  verifyOwnership(propertyId: number, owner: string): ClarityResponse<boolean> {
    const property = this.state.propertyRegistry.get(propertyId);
    return { ok: true, value: !!property && property.owner === owner };
  }

  isLeaseActive(propertyId: number, lessee: string): boolean {
    const key = `${propertyId}-${lessee}`;
    const lease = this.state.leases.get(key);
    return !!lease && lease.active && lease.expiry >= this.state.blockHeight;
  }

  getNextPropertyId(): number {
    return this.state.nextPropertyId;
  }
}

// Test setup
const accounts = {
  owner: "wallet_1",
  collaborator: "wallet_2",
  user: "wallet_3",
  lessee: "wallet_4",
};

describe("PropertyRegistry Contract", () => {
  let contract: PropertyRegistryMock;

  beforeEach(() => {
    contract = new PropertyRegistryMock();
    vi.resetAllMocks();
  });

  it("should register a new property successfully", () => {
    const result = contract.registerProperty(
      accounts.owner,
      "123 Main St",
      1000000,
      5000,
      "Co-working space in downtown"
    );
    expect(result).toEqual({ ok: true, value: 1 });
    const details = contract.getPropertyDetails(1);
    expect(details.value).toEqual(
      expect.objectContaining({
        owner: accounts.owner,
        address: "123 Main St",
        value: 1000000,
        rentalIncome: 5000,
        active: true,
      })
    );
    const status = contract.getPropertyStatus(1);
    expect(status.value).toEqual(
      expect.objectContaining({
        status: "pending",
        visibility: true,
      })
    );
  });

  it("should prevent registration with invalid params", () => {
    const longDesc = "a".repeat(501);
    const result = contract.registerProperty(
      accounts.owner,
      "123 Main St",
      0,
      5000,
      longDesc
    );
    expect(result).toEqual({ ok: false, value: 3 });
  });

  it("should update property details by owner", () => {
    contract.registerProperty(
      accounts.owner,
      "123 Main St",
      1000000,
      5000,
      "Initial desc"
    );
    const updateResult = contract.updatePropertyDetails(
      accounts.owner,
      1,
      "456 New St",
      2000000
    );
    expect(updateResult).toEqual({ ok: true, value: true });
    const details = contract.getPropertyDetails(1);
    expect(details.value).toEqual(
      expect.objectContaining({
        address: "456 New St",
        value: 2000000,
      })
    );
  });

  it("should prevent non-owner from updating details", () => {
    contract.registerProperty(
      accounts.owner,
      "123 Main St",
      1000000,
      5000,
      "Desc"
    );
    const updateResult = contract.updatePropertyDetails(
      accounts.user,
      1,
      "New Addr"
    );
    expect(updateResult).toEqual({ ok: false, value: 2 });
  });

  it("should add category by owner", () => {
    contract.registerProperty(
      accounts.owner,
      "123 Main St",
      1000000,
      5000,
      "Desc"
    );
    const addResult = contract.addPropertyCategory(
      accounts.owner,
      1,
      "co-working",
      ["urban", "tech"]
    );
    expect(addResult).toEqual({ ok: true, value: true });
    const category = contract.getPropertyCategory(1);
    expect(category.value).toEqual({
      category: "co-working",
      tags: ["urban", "tech"],
    });
  });

  it("should update status by owner or collaborator with permission", () => {
    contract.registerProperty(
      accounts.owner,
      "123 Main St",
      1000000,
      5000,
      "Desc"
    );
    // Owner update
    let statusResult = contract.updatePropertyStatus(
      accounts.owner,
      1,
      "available",
      false
    );
    expect(statusResult).toEqual({ ok: true, value: true });

    // Add collaborator
    contract.addCollaborator(
      accounts.owner,
      1,
      accounts.collaborator,
      "manager",
      ["update-status"]
    );

    // Collaborator update
    statusResult = contract.updatePropertyStatus(
      accounts.collaborator,
      1,
      "occupied",
      true
    );
    expect(statusResult).toEqual({ ok: true, value: true });

    // Unauthorized update
    statusResult = contract.updatePropertyStatus(
      accounts.user,
      1,
      "test",
      true
    );
    expect(statusResult).toEqual({ ok: false, value: 2 });
  });

  it("should set revenue share correctly", () => {
    contract.registerProperty(
      accounts.owner,
      "123 Main St",
      1000000,
      5000,
      "Desc"
    );
    const shareResult = contract.setRevenueShare(
      accounts.owner,
      1,
      accounts.collaborator,
      20
    );
    expect(shareResult).toEqual({ ok: true, value: true });
    const share = contract.getRevenueShare(1, accounts.collaborator);
    expect(share.value).toEqual({ percentage: 20, totalReceived: 0 });
  });

  it("should prevent invalid revenue percentage", () => {
    contract.registerProperty(
      accounts.owner,
      "123 Main St",
      1000000,
      5000,
      "Desc"
    );
    const shareResult = contract.setRevenueShare(
      accounts.owner,
      1,
      accounts.collaborator,
      101
    );
    expect(shareResult).toEqual({ ok: false, value: 6 });
  });

  it("should grant lease and check if active", () => {
    contract.registerProperty(
      accounts.owner,
      "123 Main St",
      1000000,
      5000,
      "Desc"
    );
    const leaseResult = contract.grantLease(
      accounts.owner,
      1,
      accounts.lessee,
      100,
      "Monthly lease"
    );
    expect(leaseResult).toEqual({ ok: true, value: true });
    const lease = contract.getLease(1, accounts.lessee);
    expect(lease.value).toEqual(
      expect.objectContaining({
        terms: "Monthly lease",
        active: true,
      })
    );
    expect(contract.isLeaseActive(1, accounts.lessee)).toBe(true);
  });

  it("should register new version and update value", () => {
    contract.registerProperty(
      accounts.owner,
      "123 Main St",
      1000000,
      5000,
      "Desc"
    );
    const versionResult = contract.registerNewVersion(
      accounts.owner,
      1,
      1500000,
      1,
      "Renovations completed"
    );
    expect(versionResult).toEqual({ ok: true, value: true });
    const version = contract.getVersionHistory(1, 1);
    expect(version.value).toEqual(
      expect.objectContaining({
        updatedValue: 1500000,
        updateNotes: "Renovations completed",
      })
    );
    const details = contract.getPropertyDetails(1);
    expect(details.value?.value).toBe(1500000);
  });

  it("should transfer ownership", () => {
    contract.registerProperty(
      accounts.owner,
      "123 Main St",
      1000000,
      5000,
      "Desc"
    );
    const transferResult = contract.transferOwnership(
      accounts.owner,
      1,
      accounts.user
    );
    expect(transferResult).toEqual({ ok: true, value: true });
    const verify = contract.verifyOwnership(1, accounts.user);
    expect(verify).toEqual({ ok: true, value: true });
  });

  it("should deactivate property", () => {
    contract.registerProperty(
      accounts.owner,
      "123 Main St",
      1000000,
      5000,
      "Desc"
    );
    const deactivateResult = contract.deactivateProperty(accounts.owner, 1);
    expect(deactivateResult).toEqual({ ok: true, value: true });
    const details = contract.getPropertyDetails(1);
    expect(details.value?.active).toBe(false);
  });
});
;; PropertyRegistry.clar
;; Sophisticated smart contract for registering and managing real estate properties in a decentralized fractional ownership platform.
;; Handles property registration, updates, categorization, status tracking, collaborator management, revenue sharing setup, licensing (e.g., leasing rights), and version history for property improvements.
;; Ensures only authorized parties can modify data, with immutable timestamps and ownership verification.

;; Constants
(define-constant ERR-ALREADY-REGISTERED u1)
(define-constant ERR-UNAUTHORIZED u2)
(define-constant ERR-INVALID-PARAMS u3)
(define-constant ERR-NOT-FOUND u4)
(define-constant ERR-EXPIRED u5)
(define-constant ERR-INVALID-PERCENTAGE u6)
(define-constant ERR-MAX-METADATA-LEN u500) ;; Max length for descriptions/notes

;; Data Maps
;; Main property registry
(define-map property-registry
  { property-id: uint } ;; Unique ID for each property
  {
    owner: principal, ;; Original owner/submitter
    timestamp: uint, ;; Registration block height
    address: (string-utf8 200), ;; Physical address or location description
    value: uint, ;; Estimated value in micro-STX (e.g., 1000000 for 1 STX)
    rental-income: uint, ;; Expected monthly rental income in micro-STX
    description: (string-utf8 500), ;; Detailed property description
    active: bool ;; Whether the property is active for tokenization
  }
)

;; Property categories and tags (e.g., commercial, residential)
(define-map property-categories
  { property-id: uint }
  {
    category: (string-utf8 50), ;; e.g., "co-working", "affordable-housing"
    tags: (list 10 (string-utf8 20)) ;; e.g., ["urban", "sustainable"]
  }
)

;; Property status tracking (e.g., under-maintenance, leased)
(define-map property-status
  { property-id: uint }
  {
    status: (string-utf8 20), ;; e.g., "available", "occupied"
    visibility: bool, ;; Publicly visible or not
    last-updated: uint ;; Block height of last update
  }
)

;; Collaborators for property management (e.g., agents, maintainers)
(define-map collaborators
  { property-id: uint, collaborator: principal }
  {
    role: (string-utf8 50), ;; e.g., "manager", "inspector"
    permissions: (list 5 (string-utf8 20)), ;; e.g., ["update-status", "add-tags"]
    added-at: uint ;; Block height added
  }
)

;; Revenue shares for stakeholders (e.g., owner, managers)
(define-map revenue-shares
  { property-id: uint, participant: principal }
  {
    percentage: uint, ;; 0-100
    total-received: uint ;; Cumulative received in micro-STX
  }
)

;; Leasing licenses (simplified for rental agreements)
(define-map leases
  { property-id: uint, lessee: principal }
  {
    expiry: uint, ;; Block height expiry
    terms: (string-utf8 200), ;; Lease terms
    active: bool
  }
)

;; Version history for property updates (e.g., renovations)
(define-map version-history
  { property-id: uint, version: uint }
  {
    updated-value: uint, ;; New estimated value
    update-notes: (string-utf8 200), ;; Description of changes
    timestamp: uint
  }
)

;; Private counter for property IDs
(define-data-var next-property-id uint u1)

;; Public Functions
(define-public (register-property 
  (address (string-utf8 200)) 
  (value uint) 
  (rental-income uint) 
  (description (string-utf8 500)))
  (let
    (
      (property-id (var-get next-property-id))
      (existing (map-get? property-registry {property-id: property-id}))
    )
    (asserts! (is-none existing) (err ERR-ALREADY-REGISTERED))
    (asserts! (> value u0) (err ERR-INVALID-PARAMS))
    (asserts! (<= (len description) ERR-MAX-METADATA-LEN) (err ERR-INVALID-PARAMS))
    (map-set property-registry
      {property-id: property-id}
      {
        owner: tx-sender,
        timestamp: block-height,
        address: address,
        value: value,
        rental-income: rental-income,
        description: description,
        active: true
      }
    )
    (map-set property-status
      {property-id: property-id}
      {
        status: u"pending",
        visibility: true,
        last-updated: block-height
      }
    )
    (var-set next-property-id (+ property-id u1))
    (ok property-id)
  )
)

(define-public (update-property-details 
  (property-id uint) 
  (new-address (optional (string-utf8 200))) 
  (new-value (optional uint)) 
  (new-rental-income (optional uint)) 
  (new-description (optional (string-utf8 500))))
  (let
    (
      (property (unwrap! (map-get? property-registry {property-id: property-id}) (err ERR-NOT-FOUND)))
      (is-owner (is-eq (get owner property) tx-sender))
    )
    (asserts! is-owner (err ERR-UNAUTHORIZED))
    (map-set property-registry
      {property-id: property-id}
      (merge property {
        address: (default-to (get address property) new-address),
        value: (default-to (get value property) new-value),
        rental-income: (default-to (get rental-income property) new-rental-income),
        description: (default-to (get description property) new-description)
      })
    )
    (ok true)
  )
)

(define-public (add-property-category
  (property-id uint)
  (category (string-utf8 50))
  (tags (list 10 (string-utf8 20))))
  (let
    (
      (property (unwrap! (map-get? property-registry {property-id: property-id}) (err ERR-NOT-FOUND)))
      (is-owner (is-eq (get owner property) tx-sender))
    )
    (asserts! is-owner (err ERR-UNAUTHORIZED))
    (map-set property-categories
      {property-id: property-id}
      {category: category, tags: tags}
    )
    (ok true)
  )
)

(define-public (update-property-status
  (property-id uint)
  (status (string-utf8 20))
  (visibility bool))
  (let
    (
      (property (unwrap! (map-get? property-registry {property-id: property-id}) (err ERR-NOT-FOUND)))
      (is-owner (is-eq (get owner property) tx-sender))
      (has-permission (or is-owner (has-permission property-id tx-sender u"update-status")))
    )
    (asserts! has-permission (err ERR-UNAUTHORIZED))
    (map-set property-status
      {property-id: property-id}
      {
        status: status,
        visibility: visibility,
        last-updated: block-height
      }
    )
    (ok true)
  )
)

(define-public (add-collaborator
  (property-id uint)
  (collaborator principal)
  (role (string-utf8 50))
  (permissions (list 5 (string-utf8 20))))
  (let
    (
      (property (unwrap! (map-get? property-registry {property-id: property-id}) (err ERR-NOT-FOUND)))
      (is-owner (is-eq (get owner property) tx-sender))
    )
    (asserts! is-owner (err ERR-UNAUTHORIZED))
    (map-set collaborators
      {property-id: property-id, collaborator: collaborator}
      {
        role: role,
        permissions: permissions,
        added-at: block-height
      }
    )
    (ok true)
  )
)

(define-public (set-revenue-share
  (property-id uint)
  (participant principal)
  (share-percentage uint))
  (let
    (
      (property (unwrap! (map-get? property-registry {property-id: property-id}) (err ERR-NOT-FOUND)))
      (is-owner (is-eq (get owner property) tx-sender))
    )
    (asserts! is-owner (err ERR-UNAUTHORIZED))
    (asserts! (<= share-percentage u100) (err ERR-INVALID-PERCENTAGE))
    (map-set revenue-shares
      {property-id: property-id, participant: participant}
      {
        percentage: share-percentage,
        total-received: u0
      }
    )
    (ok true)
  )
)

(define-public (grant-lease 
  (property-id uint) 
  (lessee principal)
  (duration uint)
  (terms (string-utf8 200)))
  (let
    (
      (property (unwrap! (map-get? property-registry {property-id: property-id}) (err ERR-NOT-FOUND)))
      (is-owner (is-eq (get owner property) tx-sender))
    )
    (asserts! is-owner (err ERR-UNAUTHORIZED))
    (map-set leases
      {property-id: property-id, lessee: lessee}
      {
        expiry: (+ block-height duration),
        terms: terms,
        active: true
      }
    )
    (ok true)
  )
)

(define-public (register-new-version 
  (property-id uint) 
  (new-value uint) 
  (version uint)
  (notes (string-utf8 200)))
  (let
    (
      (property (unwrap! (map-get? property-registry {property-id: property-id}) (err ERR-NOT-FOUND)))
      (is-owner (is-eq (get owner property) tx-sender))
    )
    (asserts! is-owner (err ERR-UNAUTHORIZED))
    (map-set version-history
      {property-id: property-id, version: version}
      {
        updated-value: new-value,
        update-notes: notes,
        timestamp: block-height
      }
    )
    ;; Update main property value
    (map-set property-registry {property-id: property-id} (merge property {value: new-value}))
    (ok true)
  )
)

(define-public (transfer-ownership (property-id uint) (new-owner principal))
  (let
    (
      (property (unwrap! (map-get? property-registry {property-id: property-id}) (err ERR-NOT-FOUND)))
      (is-owner (is-eq (get owner property) tx-sender))
    )
    (asserts! is-owner (err ERR-UNAUTHORIZED))
    (map-set property-registry {property-id: property-id} (merge property {owner: new-owner}))
    (ok true)
  )
)

(define-public (deactivate-property (property-id uint))
  (let
    (
      (property (unwrap! (map-get? property-registry {property-id: property-id}) (err ERR-NOT-FOUND)))
      (is-owner (is-eq (get owner property) tx-sender))
    )
    (asserts! is-owner (err ERR-UNAUTHORIZED))
    (map-set property-registry {property-id: property-id} (merge property {active: false}))
    (ok true)
  )
)

;; Read-Only Functions
(define-read-only (get-property-details (property-id uint))
  (map-get? property-registry {property-id: property-id})
)

(define-read-only (get-property-category (property-id uint))
  (map-get? property-categories {property-id: property-id})
)

(define-read-only (get-property-status (property-id uint))
  (map-get? property-status {property-id: property-id})
)

(define-read-only (get-collaborator (property-id uint) (collaborator principal))
  (map-get? collaborators {property-id: property-id, collaborator: collaborator})
)

(define-read-only (get-revenue-share (property-id uint) (participant principal))
  (map-get? revenue-shares {property-id: property-id, participant: participant})
)

(define-read-only (get-lease (property-id uint) (lessee principal))
  (map-get? leases {property-id: property-id, lessee: lessee})
)

(define-read-only (get-version-history (property-id uint) (version uint))
  (map-get? version-history {property-id: property-id, version: version})
)

(define-read-only (verify-ownership (property-id uint) (owner principal))
  (let ((property (map-get? property-registry {property-id: property-id})))
    (ok (and (is-some property) (is-eq (get owner (unwrap! property (ok false))) owner)))
  )
)

(define-read-only (is-lease-active (property-id uint) (lessee principal))
  (let ((lease (map-get? leases {property-id: property-id, lessee: lessee})))
    (if (is-some lease)
      (and (get active (unwrap! lease (ok false))) (>= (get expiry (unwrap! lease (ok false))) block-height))
      false
    )
  )
)

;; Private Functions
(define-private (has-permission (property-id uint) (user principal) (permission (string-utf8 20)))
  (let ((collab (map-get? collaborators {property-id: property-id, collaborator: user})))
    (if (is-some collab)
      (is-some (index-of? (get permissions (unwrap! collab false)) permission))
      false
    )
  )
)

;; Next property ID getter (for testing/debug)
(define-read-only (get-next-property-id)
  (var-get next-property-id)
)
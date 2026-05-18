# Security Specification - Collaborative Operational Tool

## 1. Data Invariants
- A `TicketRecord` must be linked to a valid case ID and have identifying audit fields.
- A `MuralPost` must have a creator and a description.
- `MuralComment` must be linked to a `MuralPost`.
- `MuralTreatment` must be linked to a `MuralPost`.
- Notifications can only be read by the `userId` they are assigned to.
- User profiles can only be updated by the owner (except for presence/lastSeen which might be updated by session logic).

## 2. The "Dirty Dozen" Payloads
1. **Identity Spoofing:** Creating a ticket with `createdBy` set to another user's UID.
2. **PII Leak:** An unauthenticated user attempting to list the `users` collection.
3. **State Shortcutting:** Updating a `TicketRecord` status from `ABERTO` directly to `CONCLUÍDO` without being the owner or having proper permissions (if tiers are enforced).
4. **Ghost Field Injection:** Adding an `isAdmin: true` field to a `User` profile update.
5. **Orphaned Write:** Creating a `MuralComment` for a `MuralPost` that doesn't exist.
6. **Notification Hijack:** A user attempting to read or mark as read a notification belonging to another user.
7. **Resource Poisoning:** Injecting a 1MB string into the `caseId` field of a `TicketRecord`.
8. **Unauthorized Deletion:** An authenticated user attempting to delete a `MuralPost` they didn't create.
9. **Timestamp Spoofing:** Setting a future date for `createdAt` in a new `MuralPost`.
10. **Query Scraping:** An authenticated user listing ALL `tickets` without a filter, trying to bypass intended UI limits.
11. **Immutable Field Update:** Changing the `caseId` of an existing `TicketRecord`.
12. **Self-Promotion:** A user trying to add themselves to a hypothetical `admins` collection.

## 3. The Test Runner
```typescript
import { TicketRecord, MuralPost, MuralComment, MuralTreatment, User as AppUser, MuralNotification } from './types';

// Mock payloads for testing security rules (TDD approach)
// These would be used with the Firebase Emulators in a real environment.
```

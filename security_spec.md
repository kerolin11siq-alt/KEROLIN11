# Security Specification - FSJ Monitor

## 1. Data Invariants
- A **Ticket** must have a valid `caseId` and `creatorUser`.
- A **MuralPost** must be linked to a `userId` (author).
- A **MuralTreatment** must be linked to a `mural_post_id` (if applicable) and have a `responsible`.
- **User** profiles can only be created by the user themselves.
- **Notifications** are private to the recipient.

## 2. The "Dirty Dozen" Payloads (Attack Vectors)
1. **Identity Spoofing**: Attempt to create a `MuralPost` with another user's `userId`.
2. **Resource Poisoning**: High-size string in `description` (exceeding 5000 chars).
3. **Privilege Escalation**: Attempt to delete another user's `MuralPost`.
4. **State Shortcutting**: Mark a `Ticket` as `CONCLUIDO` without going through mandatory fields (if enforced).
5. **Orphaned Writes**: Create a `MuralTreatment` for a non-existent `MuralPost`.
6. **Information Disclosure**: Read all user profiles (PII leak).
7. **Spam Attack**: Rapid creation of `MuralComments`.
8. **Invalid ID Injection**: Use special characters in document IDs.
9. **Timestamp Manipulation**: Set `createdAt` to a future date.
10. **Bypassing Verification**: Write data without `email_verified == true` (if required).
11. **Shadow Field Injection**: Adding an `isAdmin` field to a `User` profile.
12. **Unauthorized List Query**: Querying all `notifications` without filtering by `userId`.

## 3. Test Runner (Draft)
A test suite will be implemented to verify:
- `allow create/update`: if `request.auth.uid == data.userId`
- `allow read`: if `resource.data.userId == request.auth.uid` (for notifications)
- `isValidId()` check for all path variables.

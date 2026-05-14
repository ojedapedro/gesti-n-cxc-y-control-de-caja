# Security Specification - Cuentas por Cobrar (CXC) & Box Control

## Data Invariants
1.  A Cuentas por Cobrar (CXC) payment must refer to a valid client.
- Expenses must have a category.
- Transactions must have a date and a USD amount (primary currency for balance).
- All timestamps must be server-generated.
- Amounts cannot be negative (except for specific cases if allowed, but generally not).

## The "Dirty Dozen" Payloads
1.  **Anonymous Write:** Attempting to write to `transactions` without being logged in.
2.  **Identity Theft:** User A attempting to delete or update an expense created by User B (if ownership is enforced, though in this business app maybe all admins can see all).
3.  **Future Date:** Setting `createdAt` to a future date manually.
4.  **Balance Manipulation:** Directly updating `totalBalance` in `cxc_accounts` without a corresponding transaction/payment (if logic is shared, though here we might trust the write if it's a small app, but better to protect).
5.  **Large Field:** Injecting a 2MB string into `concept`.
6.  **Invalid ID:** Using `../..` or similar as a document ID.
7.  **Shadow Update:** Adding `isAdmin: true` to a user profile.
8.  **Type Mismatch:** Sending a string for `amountUsd`.
9.  **Negative Amount:** Sending `-1000` for an expense.
10. **Orphaned Payment:** Creating a payment for a client ID that doesn't exist.
11. **Improper Status:** Transitioning a receipt to a state it shouldn't be in (if applicable).
12. **Information Leak:** Unauthorized user listing all `cxc_accounts`.

## The Test Runner (Plan)
I will provide a `firestore.rules.test.ts` (conceptual or actual if I had a test runner, but here I will focus on the rules themselves and manual verification via logic).

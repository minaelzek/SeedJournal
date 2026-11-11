# Technical privacy and export limitations

Seed Journal encrypts journal entry content before it is stored in D1.
Sign-in is Google or Apple. After you authenticate, the Worker unwraps an
account-scoped data key for that session so there is no passphrase to type.
The server can unwrap journals for a signed-in session. It does not receive
a user-held passphrase.

This is **account-private**, not a zero-knowledge vault. Welcome and settings
copy must say so plainly.

The current export surface is intentionally export-only:

- **Encrypted archive** is a backup artifact for safekeeping. The product does
  not currently import or restore this archive.
- **Readable Markdown** is an intentionally unencrypted download. Treat it as
  sensitive after it leaves the browser.
- Export does not change server retention or deletion behavior.
- Account deletion removes the server-side account data and should be followed
  by local encrypted-data cleanup verification.

The encrypted design does not make every field anonymous. Server-side metadata
needed for synchronization can include account ownership, revisions, entry
state, timestamps, completion identifiers, and growth ordering. Product and
legal copy should describe this limitation accurately before public launch.

Do not place passphrases, plaintext entries, decryption keys, or encrypted
payloads in browser-test traces, screenshots, logs, analytics, or support
tickets.

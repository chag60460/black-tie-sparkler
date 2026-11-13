# An evening with Grace

Two public entry points:

- `index.html`: invitation, RSVP, Gold dust, dress code, and agenda.
- `gifts.html`: a standalone gift list with no invitation or agenda navigation.

Both entry points are public. The separate gift page is not access control
for the invitation. Search indexing is discouraged with robots directives,
but that does not make either page private.

## Validate and publish

Use Node.js 22 or newer. No build dependencies are required.

```sh
npm test
npm run build
```

GitHub Pages deploys the explicit production file list in `dist/` when
`main` is pushed. Design experiments and database setup scripts are not
included in the website artifact.

## Shared services

RSVPs go to the configured Formspree endpoint. Only a confirmed accepting
response starts Gold dust; declines and failed submissions do not.

Gift claims use the existing Supabase project and atomic `claim_gift_items`
database function. The published key is a browser publishable key, not a
service-role secret. First names are intentionally public, self-entered
labels, not authenticated identities. Both invitation recipients and
standalone gift-list visitors see the same shared inventory.

Do not submit test RSVPs or claim the real gifts during validation. Browser
submission tests should intercept the backend; the Node tests never submit
to either service. Product photo provenance is in
`assets/gift-photo-sources.txt`.

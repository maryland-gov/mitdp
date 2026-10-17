## What changed

<!-- One or two sentences. Link the issue if there is one. -->

## Want a preview URL?

Add the **`launchpad-deploy-preview`** label to this PR, then wait for the
"🚀 LaunchPad PR Preview" check.

The URL is not posted as a comment. Find it in that run's **job summary**, or
go straight to it — the hostname is predictable:

```
https://pr-<this PR number>-maryland-gov-mitdp-mitdp.preview.maryland.dev
```

Remove the label or close the PR to tear the environment down.

Previews are for review only. Production is published to GitHub Pages from
`main` after merge, unchanged by this.

## Checklist

- [ ] Content renders as intended (`npm run build`, then open `docs/`)
- [ ] Links resolve, including anything added to `partials/footer.html` or a
      sidebar in `content/_sidebars/`

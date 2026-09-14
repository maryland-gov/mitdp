# Preview deployments

This directory exists **only** to give pull requests a reviewable URL. It does
not deploy production.

Production for this repo is GitHub Pages at
<https://maryland-gov.github.io/mitdp/>, published by
`.github/workflows/publish.yml` on push to `main`. That is unchanged.

## How a preview happens

1. Open a PR.
2. Add the `launchpad-deploy-preview` label to it.
3. `.github/workflows/launchpad-preview.yml` calls the shared pipeline at
   `mdds-engineering/launchpad/.github/workflows/launchpad-release.yaml@main`,
   which builds `.deploy/docker/Dockerfile`, pushes to ECR, and hands the Helm
   chart in `.deploy/helm` to ArgoCD.
4. ArgoCD creates a namespace per PR and brings the environment up.

Removing the label or closing the PR tears the environment down.

## Finding the URL

There is no PR comment. The step that would post one is commented out upstream
(`launchpad-release.yaml:531-534`); the live step at `:580-581` renders the
ingress list with `OutputToGithubSummary: true`, so the URL lands in the
Actions **job summary** of the preview run and nowhere else.

The hostname is deterministic, so you can also just construct it:

```
https://pr-<n>-maryland-gov-mitdp-mitdp.preview.maryland.dev
```

`mitdp` appears twice because the chart builds the host as
`<previewId>-<subdomain>` and the pipeline sets `previewId` to the namespace,
`pr-<n>-<org>-<repo>`. Cosmetic, and not worth diverging from the shared
ingress template to fix.

Worth asking the platform team to uncomment those four lines — that step is
exactly the missing affordance.

## Layout note

`build.js` emits absolute links to `/mitdp/*` because production serves from
the GitHub Pages project subpath. The container therefore mounts the build at
`/app/mitdp` and puts a redirect at `/`, so those links resolve without
maintaining two sets of URLs. `/healthz` is a static file for the probes.

## Files

| File | Purpose |
|------|---------|
| `docker/Dockerfile` | Two-stage: `npm run build`, then serve `docs/` on :3000 |
| `helm/Chart.yaml` | Chart metadata |
| `helm/values.yaml` | Base values (ingress, probes, resources) |
| `helm/values/values.preview.yaml` | Preview overrides; image and previewId come from the pipeline |

The starter kit and the other MDDS repos also carry a `.deploy/VERSION` listing
per-environment image tags. It is deliberately absent here. `checkDeployStructure`
(`cmd/launchpad/system_status.go:373-379`) does not require it, nothing in
LaunchPad reads `*_IMAGE_TAG`, and the steps that would rewrite it
(`update update --commit`) are all gated on `github.ref == 'refs/heads/main'`,
which never holds on a pull request. On a preview-only path the file would sit
there stale, claiming in its own header to be CI-maintained.

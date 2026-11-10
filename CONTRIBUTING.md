# Contributing to LukiFitti

Thanks for your interest in LukiFitti! Bug reports, ideas, and pull requests are all welcome.

## Getting started

1. Follow the [Quick Start](README.md#quick-start) in the README to set up the monorepo
   (API, web app, database) locally. The native iPhone and Apple Watch app lives in
   [`apps/apple`](README.md#native-apple-app-appsapple).
2. Create a feature branch from `main`.
3. Before opening a pull request, run the same checks as CI:

   ```bash
   yarn format:check
   yarn lint
   yarn test
   ```

4. Open a pull request against `main` and describe **why** the change is needed.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are checked by
commitlint, for example:

```text
feat(nav): add skip-to-content link for keyboard navigation
fix(ux): show service descriptions on mobile without hover
```

Allowed types: `feat`, `fix`, `refactor`, `style`, `perf`, `test`, `docs`, `build`, `ci`,
`chore`, `revert`. Use a lower-case subject in imperative mood without a trailing period.

## Trying the API

The [`bruno/`](bruno) folder contains a [Bruno](https://www.usebruno.com/) collection
(OpenCollection YAML) with a request for every API endpoint. Open the folder in Bruno, select the
`local` environment, and run `auth/login` first. It stores the CSRF token that the other
requests need.

## Become a contributor

If you want to get closer to the project, for example to help shape the roadmap, review pull
requests, or work on features over a longer period, you can be added as a contributor. Just write
an email to [tonymeissner70@gmail.com](mailto:tonymeissner70@gmail.com) and tell me a bit about
yourself and what you would like to work on.

As a contributor you also get access to:

- **[Grafana KPI dashboard](https://grafana.tony-luke.de/d/luki-fitti-kpis/lukifitti-kpis)**:
  aggregated key figures about how LukiFitti is used.
- **Umami analytics**: anonymous page and screen views and usage events of the web app and the
  iOS app.

## Why we collect usage data

LukiFitti collects a small amount of usage data. It is **not related to a person**:

- Umami runs cookieless and creates no personal profiles or device identifiers. The IP address
  is only used to derive the country and a rotating hash, and is then discarded.
- Events are anonymous and allow-listed (for example "workout started" or "workout finished").
  They never contain names, email addresses, free text, weights, heart rate, or other health or
  body data.
- There is no advertising, and no data is sold.

We use this data only to understand **what** is used, **how** it is used, and **what we could
improve**. For example, it shows which features people rely on, where they drop off, and which
parts of the app deserve more attention. The details are in the
[privacy policy](https://luki-fitti.tony-luke.de/en/privacy).

## License

By contributing you agree that your contributions are licensed under the
[AGPL-3.0](LICENSE) and may be shipped in the official LukiFitti builds, including the App Store
releases for iPhone and Apple Watch.

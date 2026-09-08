# Universal AI Gateway Relay Requirements — Compatibility Notice

This file is retained to preserve existing links.

It is **not** a canonical or normative source.

The former Japanese requirements for the current ChatGPT relay and the planned
generic `/upstream/<provider-slug>/*` relay have been consolidated into the
English canonical technical specification:

- [SPEC.md](SPEC.md)

Use `SPEC.md` for:

- implemented `/v1/responses` behavior;
- plugin routing and header contracts;
- fail-closed and credential-boundary requirements;
- timeout and streaming semantics;
- the planned generic fixed-provider relay;
- path containment;
- JSON normalization and root-`anyOf` safety rules;
- body-size and concurrency limits;
- provider-compatible error envelopes;
- redirect policy;
- protected acceptance and release gates.

Human-facing configuration, deployment, and operations guidance lives under
`docs/`.

This compatibility file should not receive independent technical updates.
Correct `SPEC.md` first.

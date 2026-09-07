# GitHub Program Reconciler

Explicit-only skill for current-main Toolkit programme governance. It covers
the compatibility N5 parent/direct-child and truthful PR-review contract plus
the accepted v5 canonical programme/bootstrap recovery surface.

V5 uses the shared
repo/scripts/toolkit-github-governance-review-reconciler.cjs facade, migrates
from the allowlisted v4 state, and keeps the existing
repo/scripts/toolkit-github-program-receipt.cjs subsystem as the sole durable
receipt source. It derives deterministic projections, preserves owner bytes,
requires independently trusted PR and native-relationship scopes, and fails
closed on stale, incomplete, contradictory, or over-budget inputs.

Programme Apply, bootstrap-file Apply, managed body/label/relationship writes,
receipt persistence, provider/runtime mutation, review-thread mutation, Ready,
merge, and Web finality remain outside this skill and require their separate
authority boundaries.

This skill is directly canonical. Use the shared facade and focused v4/v5
recovery tests when validating the current product.

# Open-source history cleanup

Before publishing this repository, remove generated and local-only artifacts
from Git history. The cleanup targets these paths exactly:

- `examples/sandbox-next/.next`
- `docs/qa/screenshots`
- `.codex/config.toml`

The current checkout is intentionally not a valid rewrite target. Install
[git-filter-repo](https://github.com/newren/git-filter-repo), create a fresh
mirror outside the checkout, and run the helper against that mirror:

```sh
brew install git-filter-repo
git clone --mirror <repository-url> /private/tmp/nudge-ui-history
scripts/sanitize-history.sh /private/tmp/nudge-ui-history
```

The helper refuses the checkout, shared Git directories, dirty worktrees, and
in-progress Git operations. It uses `git-filter-repo` without `--force`, passes
only the three paths above, processes all refs using the tool's default, then
expires reflogs and prunes unreachable objects. It never pushes.

Inspect the rewritten mirror before publishing it. Rewriting changes commit
IDs, so coordinate a force-push of all affected branches and tags with anyone
who has a clone. Existing clones retain the old history and should be
recloned (or deliberately reset after coordination). A mirror push is
destructive, for example:

```sh
git -C /private/tmp/nudge-ui-history push --force --mirror <remote>
```

If the remote rejects the update because branch or tag protection is enabled,
use the repository host's normal, coordinated process to authorize the
rewrite. The helper does not bypass those protections or rewrite the remote.

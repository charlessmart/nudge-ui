# Nudge UI Chrome extension: privacy policy

Last updated: 2026-10-28

Nudge UI is a visual inspector for editing a web page's CSS. It runs on a tab
only when you click its toolbar button or press its keyboard shortcut.

## What it accesses

When you activate Nudge UI on a tab, it reads that page's DOM, computed styles,
stylesheets, and images in your browser so it can show and preview edits. This
happens locally. The extension requests no host permissions and does not touch
tabs you have not activated it on.

When you press **Screenshot** in the sketch bar, Nudge UI takes a picture of the
visible tab and copies it to your clipboard. The picture is not kept.

When you choose **Show system fonts** in a font family list, Nudge UI reads the
names of the font families installed on your device so you can pick one. It
remembers that choice for the site, and the list stays in your browser. Sites
cannot get these names until you make that choice. After you do, the site's
own scripts can read them while you use Nudge UI on that site.

## What it stores

Your edits and comments are saved per site in
`chrome.storage` on your device so they survive reloads. The extension also
remembers which side of the window you last docked the panel to, as one
setting for all sites. This data never leaves your browser through the
extension. Removing the extension deletes it.

## What it sends

Nothing. Nudge UI has no analytics, telemetry, advertising, or accounts, and it
does not send data to the developer or any third party.

Two actions you control can move data elsewhere:

- **Copy prompt:** copies a text prompt to your clipboard for you to paste into
  a coding agent of your choice.
- **Local agent bridge:** if your own development setup configures one, the
  extension can send edits to a coding-agent bridge on the same origin or on
  `localhost`. It does not connect to remote bridges.

## Data sale and use

We do not sell or transfer user data, use it for purposes unrelated to the
extension's single purpose, or use it for creditworthiness or lending.

## Remote code

All code ships inside the extension package. It does not load or run remote
code.

## Changes and contact

Changes to this policy are published in this file's history. Questions: open an
issue at <https://github.com/charlessmart/nudge-ui/issues>.

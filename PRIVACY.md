# Privacy Policy — Browser Utils

Last updated: 13 October 2026

Browser Utils does not collect, store or transmit any personal data.

The extension has no servers, no accounts, no analytics and no third-party
services. Nothing it reads ever leaves your device.

## What the extension accesses, and why

**Open tab addresses and titles.** The extension compares the addresses of your
open tabs to find the ones showing the same page, and uses their titles to tell
you which tab already has it. This comparison happens in memory, while the
browser is running. No list of visited pages is kept, written to disk or sent
anywhere.

**Clipboard images.** When you click a file upload field that accepts images,
the extension checks once whether your clipboard holds an image, so it can offer
it as the file to upload. It reads image items only; text and other clipboard
content are ignored. The clipboard is never read in the background, on a timer,
on page load, or without that click. If you choose the image, it is handed to
that upload field — the same place you were already sending it — and nowhere
else.

**Page content.** The extension draws its own indicators on the pages you visit
(the duplicate-tab title prefix, the mark over the tab icon, the tooltip over a
link already open, the upload dialog). It does not read, collect, modify or
transmit the content of those pages.

## What is stored

Only your own settings for this extension: which features are on, the title
prefix text, the chosen tab-icon mark style, whether incognito tabs are kept
apart, and your URL-matching rules.

These are saved with Chrome's own `storage.sync`, which means Chrome may sync
them across devices where you are signed in to your browser profile, under
Chrome's privacy terms. The extension itself has no access to anything beyond
these settings, and the developer never receives them.

## Data sharing

None. No user data is sold, transferred to third parties, used for any purpose
unrelated to the features described above, or used to determine creditworthiness
or for lending purposes.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `tabs` | Read the address and title of open tabs to detect duplicates and switch to an existing tab. |
| `clipboardRead` | Read an image from the clipboard when you click an image upload field, to offer it as the file. |
| `storage` | Save your settings for this extension. |
| Access to the sites you visit | Draw the duplicate indicators and the upload dialog on the page you are on, and fetch a tab's favicon to redraw it with the duplicate mark. |

The extension makes no other network requests. All of its code ships inside the
extension package; no remote code is loaded or executed.

## Changes

If a future version changes what the extension accesses, this document and the
Chrome Web Store data disclosures will be updated before that version is
published.

## Contact

Questions about this policy: open an issue at
https://github.com/LucasHollmann/browser-utils-chrome-ext/issues

# Importing data from MCI

[MCI](https://mcisolutions.de/) is a subscription-based strength training app for iPhone and
Apple Watch. The iOS and web profile settings link to this guide.

## Status: not possible yet

There is currently **no way to move your MCI data into LukiFitti**. MCI does not offer any export
functionality (no CSV, JSON or file export), so there is nothing to convert into a
[`luki-fitti-import@1`](import-format.md) file.

## Possible approaches (not investigated)

It may be possible to get the data out with more digging, similar to the
[GymLife guide](gymlife-import.md), which reads the app's local database from an unencrypted
iPhone backup. For MCI this could mean:

- inspecting an unencrypted iPhone backup for a local database or cache files of the MCI app, or
- looking at the data the app syncs with its backend.

None of this has been tried. It is unknown whether MCI stores your training history locally at all
or only on its servers.

## Help wanted

If you find a working way to extract your MCI data, please open an issue or pull request on
[GitHub](https://github.com/tuke307/luki-fitti) — a converter would let others switch too.

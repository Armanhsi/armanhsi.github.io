# armanhsi.github.io

Personal research website of **Arman Hosseini**, PhD Candidate in Systems & Information Engineering at the University of Virginia (ORCL Lab).

Live at **https://armanhsi.github.io**

Plain HTML, CSS and JavaScript: no frameworks, no build step.

## Files

| File | What it holds |
|---|---|
| `index.html` | All page content. Look for `<!-- EDIT: ... -->` comments. |
| `style.css` | Look and feel. Colors, fonts and spacing are tokens at the top in `:root`. |
| `script.js` | The 3D wireframe world, window tilt, gaze cursor, demo signals, filters and dock. |
| `404.html` | Page shown for broken links. |
| `assets/` | `headshot.jpg`, and your CV as `Arman_Hosseini_CV.pdf`. |

## Common updates

- **Add a paper:** copy a `<li class="pub">` block in the Publications section and update the group's count.
- **Add news:** copy a `<li class="log-item">` to the top of the right year and move `is-new` to it.
- **Update citation metrics:** edit the numbers and date in the `metrics` block.
- **Swap the CV:** replace `assets/Arman_Hosseini_CV.pdf` (keep the same name).
- **After editing `style.css` or `script.js`:** bump `?v=` on their links in `index.html` (and `404.html` for CSS) so browsers fetch the new version.

## Preview locally

```bash
python -m http.server 5500
```

Then open http://localhost:5500.

## Publish changes

```bash
git add -A
git commit -m "Describe the change"
git push
```

GitHub Pages redeploys automatically within a minute or two.

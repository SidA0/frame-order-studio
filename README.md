# Frame Order Studio

A browser based tube frame workspace for importing cut lists and multi-body STEP files, reviewing detected tube profiles and wall thicknesses, producing individual drawings, and exporting grouped STEP bodies with a fixed isometric assembly sheet.

The assembly sheet views the source CAD from +X, +Y, +Z. Its camera rotation changes only the drawing; exported STEP coordinates and solids are preserved.

For the supplied `Frame Send Out.STEP`, item 22 is source body 23 and item 23 is source body 22. The assembly, exported filenames, individual drawings, and `body-number-geometry-map.csv` use the same corrected item numbers; source solid geometry remains in its original coordinates.

The STEP contains 27 mirrored body pairs. The known 22/23 correction is prefilled for this exact source file. The other 26 pairs require explicit side-by-side numbering review in the website before any numbered export is enabled. Each ZIP includes `numbering-review.csv`.

## Use the hosted version

Open [Frame Order Studio](https://sida0.github.io/frame-order-studio/) or its [button-by-button tutorial](https://sida0.github.io/frame-order-studio/tutorial.html). STEP files are processed in the browser and are not uploaded to the site.

The hosted version exports original STEP bodies and drawings. Exact CAD correction workflows, including additive 45 degree end review, require the local companion below.

## Local CAD companion

Download [frame-order-studio-local.zip](https://sida0.github.io/frame-order-studio/frame-order-studio-local.zip), extract it, then run `Start Frame Order Studio.cmd`. Node.js is required. Open the local address shown in the command window. To enable the CAD correction tools, run `Install CAD Correction.cmd` once; this installs the pinned CadQuery OpenCascade package for Python 3.11 or 3.12.

The companion includes only the application and correction scripts. Add your own CAD source files after extraction.

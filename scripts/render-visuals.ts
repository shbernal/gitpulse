import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";
import { ansiToSvg, visibleLineLengths } from "./ansi-to-svg";
import { visualOutputCases } from "./visual-fixtures";
import { defaultThemeName, getPalette, rgbToCss } from "../src/render/palettes";

type ManifestEntry = {
  allowOverflow: boolean;
  columns: number;
  files: {
    ansi: string;
    png?: string;
    svg: string;
  };
  id: string;
  maxVisibleLineLength: number;
  notes: string[];
  theme: string;
  title: string;
};

const defaultOutputDir = "artifacts/visual-output";

async function main(): Promise<void> {
  const outputDir = parseOutputDir(process.argv.slice(2));
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });

  const manifest: ManifestEntry[] = [];

  for (const outputCase of visualOutputCases()) {
    const ansiPath = join(outputDir, `${outputCase.id}.ansi`);
    const svgPath = join(outputDir, `${outputCase.id}.svg`);
    const pngPath = join(outputDir, `${outputCase.id}.png`);
    const lineLengths = visibleLineLengths(outputCase.ansi);
    const maxVisibleLineLength = Math.max(...lineLengths);
    const palette = getPalette(outputCase.theme ?? defaultThemeName);

    await writeFile(ansiPath, outputCase.ansi);
    await writeFile(
      svgPath,
      ansiToSvg(outputCase.ansi, {
        columns: outputCase.columns,
        defaultBackground: rgbToCss(palette.background),
        defaultForeground: rgbToCss(palette.text),
        title: outputCase.title,
      }),
    );

    const pngCreated = await renderPngIfPossible(svgPath, pngPath);

    manifest.push({
      allowOverflow: Boolean(outputCase.allowOverflow),
      columns: outputCase.columns,
      files: {
        ansi: ansiPath,
        ...(pngCreated ? { png: pngPath } : {}),
        svg: svgPath,
      },
      id: outputCase.id,
      maxVisibleLineLength,
      notes: outputCase.notes,
      theme: outputCase.theme ?? defaultThemeName,
      title: outputCase.title,
    });
  }

  await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), cases: manifest }, null, 2)}\n`);

  console.log(`Generated ${manifest.length} visual output cases in ${outputDir}`);
  for (const entry of manifest) {
    const overflow = entry.maxVisibleLineLength > entry.columns ? `, overflow ${entry.maxVisibleLineLength}/${entry.columns}` : "";
    const png = entry.files.png ? ", png" : "";
    console.log(`- ${entry.id}: svg${png}${overflow}`);
  }
}

function parseOutputDir(args: string[]): string {
  const outputIndex = args.indexOf("--output");

  if (outputIndex >= 0) {
    const value = args[outputIndex + 1];
    if (!value) {
      throw new Error("--output requires a directory path.");
    }

    return value;
  }

  return defaultOutputDir;
}

async function renderPngIfPossible(svgPath: string, pngPath: string): Promise<boolean> {
  const rsvg = await findExecutable("rsvg-convert");

  if (rsvg) {
    await run(rsvg, [svgPath, "-o", pngPath]);
    return true;
  }

  const magick = await findExecutable("magick");

  if (magick) {
    await run(magick, [svgPath, pngPath]);
    return true;
  }

  return false;
}

async function findExecutable(command: string): Promise<string | null> {
  const paths = (process.env.PATH ?? "").split(delimiter).filter(Boolean);

  for (const directory of paths) {
    const candidate = join(directory, command);

    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue scanning PATH.
    }
  }

  return null;
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with status ${code}`));
      }
    });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown visual output error.");
  process.exitCode = 1;
});

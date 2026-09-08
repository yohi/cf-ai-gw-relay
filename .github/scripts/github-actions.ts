export async function writeGithubOutput(
  name: string,
  value: string,
): Promise<void> {
  const outputPath = Deno.env.get("GITHUB_OUTPUT");
  if (outputPath === undefined || outputPath.length === 0) return;
  await Deno.writeTextFile(outputPath, `${name}=${value}\n`, { append: true });
}

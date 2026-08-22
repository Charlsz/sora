export function shellCommand(command: string): string[] {
  if (process.platform === "win32") {
    return ["cmd", "/d", "/s", "/c", command];
  }
  return ["bash", "-lc", command];
}

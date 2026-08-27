/** True when chat should stay skinny because Open desktop owns the rest. */
export function isOpenDesktopLayout(
  computerOpen: boolean,
  vmControlUrl: string | null | undefined,
  showChatChrome: boolean,
): boolean {
  return Boolean(computerOpen && vmControlUrl && showChatChrome);
}

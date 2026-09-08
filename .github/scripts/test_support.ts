export function assertEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

export function assertThrows(action: () => void, message: string): void {
  let thrown = false;
  try {
    action();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    thrown = true;
  }
  if (!thrown) throw new Error(`${message}: expected an error`);
}

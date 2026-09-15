/** Subgroup selections belong to a single saved class. */
export function changeSavedClass(
  userId: number,
  className: string,
  classes: Map<number, string>,
  subgroups: Map<number, number>,
  englishGroups: Map<number, string>,
): void {
  if (classes.get(userId) !== className) {
    subgroups.delete(userId);
    englishGroups.delete(userId);
  }
  classes.set(userId, className);
}

export function isSavedClass(userId: number | undefined, className: string, classes: Map<number, string>): boolean {
  return userId !== undefined && classes.get(userId) === className;
}

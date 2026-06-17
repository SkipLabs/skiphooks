/** Throw a single combined error if a GraphQL response carries any errors. */
export function assertNoGraphqlErrors(
  result: { errors?: Array<{ message: string }> },
  context: string,
): void {
  if (result.errors?.length) {
    throw new Error(`${context}: ${result.errors.map((e) => e.message).join(", ")}`);
  }
}

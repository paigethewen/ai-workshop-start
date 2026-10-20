/** A failure explained to the user: the CLI prints the message and exits with code 1. */
export class AtlasError extends Error {}

/** GitHub out of reach, rate-limited or refusing the token: no other repository would scan either. */
export class GitHubUnavailable extends AtlasError {}

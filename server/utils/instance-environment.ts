import { portalEnvironmentSchema } from '../../shared/portal-environment'
import { decryptSecret } from './crypto'

// These values are intentionally absent from the public instance model and audit metadata.
export function decodeInstanceEnvironment(encrypted: string | null | undefined) {
  try {
    return encrypted ? portalEnvironmentSchema.parse(JSON.parse(decryptSecret(encrypted))) : []
  } catch {
    throw new Error('Stored instance environment variables could not be read')
  }
}

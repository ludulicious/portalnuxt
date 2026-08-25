import { toWebRequest } from 'h3'
export default defineEventHandler((event) => usePlatformAuth().handler(toWebRequest(event)))

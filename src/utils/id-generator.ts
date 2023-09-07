import { nanoid } from './'
let index: number = 10000

export const idGenerator = () => `${nanoid(5)}-${index++}`

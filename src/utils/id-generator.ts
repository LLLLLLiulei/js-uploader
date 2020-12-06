let index: number = Math.floor(Date.now() / 1000)

export const idGenerator = () => `${index++}`

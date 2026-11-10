export function notificationSlot(now: Date) {
  const local = new Date(now.getTime() + 7 * 3600000).toISOString()
  const day = local.slice(0,10), time = local.slice(11,16), hour = time.slice(0,2)
  if (hour !== '12' && hour !== '22') return null
  return { day, time, boundary: `${day}T${hour}:00:00+07:00` }
}

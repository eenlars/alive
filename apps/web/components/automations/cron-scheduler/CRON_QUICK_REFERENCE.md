# Cron Expression Quick Reference

## Basic Format
```
minute hour day month weekday
```

## Examples

### Every N Minutes
```
*/5 * * * *     Every 5 minutes
*/10 * * * *    Every 10 minutes
*/15 * * * *    Every 15 minutes
*/30 * * * *    Every 30 minutes
```

### Hourly
```
0 * * * *       Every hour at :00
15 * * * *      Every hour at :15
30 * * * *      Every hour at :30
```

### Daily
```
0 9 * * *       Every day at 9:00 AM
30 14 * * *     Every day at 2:30 PM
0 0 * * *       Every day at midnight
```

### Days of Week
```
0 9 * * 1       Every Monday at 9:00 AM
0 9 * * 1-5     Weekdays at 9:00 AM
0 9 * * 0       Every Sunday at 9:00 AM
0 9 * * 0,6     Weekends at 9:00 AM
```

### Monthly
```
0 9 1 * *       1st of each month at 9:00 AM
0 9 15 * *      15th of each month at 9:00 AM
0 9 L * *       Last day of month at 9:00 AM (not standard)
```

### Multiple Times
```
0 9,17 * * *    9:00 AM and 5:00 PM daily
0 9,12,18 * * * 9 AM, noon, and 6 PM daily
```

### Ranges
```
0 9-17 * * *    Every hour 9 AM to 5 PM
0 0 1-15 * *    1st to 15th of each month
0 0 * 1-6 *     January to June at midnight
```

## Field Reference

### Minute (0-59)
```
0       Top of hour
15      :15
30      :30
45      :45
*/5     Every 5 minutes
```

### Hour (0-23, UTC)
```
0       Midnight
6       6 AM
9       9 AM
12      Noon
18      6 PM
23      11 PM
```

### Day of Month (1-31)
```
1       1st
15      15th
L       Last day (non-standard)
```

### Month (1-12)
```
1       January
6       June
12      December
1-6     January through June
```

### Day of Week (0-7, 0 and 7 = Sunday)
```
0       Sunday
1       Monday
2       Tuesday
3       Wednesday
4       Thursday
5       Friday
6       Saturday
0-4     Sunday through Thursday
1-5     Monday through Friday
```

## Special Characters

### * (Any)
Means "any value for this field"
```
0 * * * *       Every hour at :00
0 0 * * *       Every day at midnight
```

### , (Multiple)
Separate multiple values
```
0 9,17 * * *    9 AM and 5 PM
0 0 1,15 * *    1st and 15th of month
```

### - (Range)
Specify a range
```
0 9-17 * * *    9 AM through 5 PM
0 0 * 1-6 *     January through June
```

### / (Step)
Every Nth value
```
*/5 * * * *     Every 5 minutes
0 */6 * * *     Every 6 hours
```

## Common Mistakes

### ❌ Invalid
```
0 9 * * *-5     Wrong format for range
* * * * *       This is valid but runs every minute
0 9,17,21 * *   Missing seconds (only 5 fields)
```

### ✅ Correct
```
0 9 * * 1-5     Weekdays at 9 AM (correct range)
0 9,17,21 * *   9 AM, 5 PM, 9 PM daily (correct)
```

## Timezone Note

Cron expressions are evaluated in **UTC** by default.

If you need a different timezone:
- Check the "Advanced settings" for timezone selector
- Cron times are then interpreted in that timezone
- Example: Set to "Europe/Amsterdam" (UTC+1/+2) and use `0 9 * * 1-5` for 9 AM Amsterdam time

## Tools

To test your cron expressions:
1. Use the preset selector for quick setup
2. Switch to "Custom" tab for advanced schedules
3. See the plain English description update in real-time
4. Green checkmark = expression is valid

## Need Help?

- **Not sure which preset**: Hover over descriptions to see what each does
- **Want to enter custom cron**: Switch to "Custom" tab and type your expression
- **Got validation error**: Check that you have exactly 5 space-separated fields
- **Still confused**: Stick with presets! They cover 90% of common use cases

import { registerDecorator, type ValidationOptions } from 'class-validator';

const EARLIEST_DATE = '1900-01-01';

/** DATA-2: a day that exists on the calendar, written `YYYY-MM-DD`. */
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().startsWith(value) &&
    value >= EARLIEST_DATE
  );
}

const todayInVietnam = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(),
  );

function dateDecorator(
  name: string,
  check: (value: unknown) => boolean,
  options?: ValidationOptions,
) {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name,
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate: check,
        defaultMessage: () => `${String(propertyName)} must be a real date`,
      },
    });
  };
}

export const IsCalendarDate = (options?: ValidationOptions) =>
  dateDecorator('isCalendarDate', isCalendarDate, options);

/** For a birth date: a real day, not later than today. */
export const IsBirthDate = (options?: ValidationOptions) =>
  dateDecorator(
    'isBirthDate',
    (value) => isCalendarDate(value) && value <= todayInVietnam(),
    options,
  );

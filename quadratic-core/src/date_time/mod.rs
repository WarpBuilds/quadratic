//! Handles converting NaiveDate, NaiveTime, and NaiveDateTime to strings using
//! strftime format strings. This is a bit complicated because we have to handle
//! the case where the format string contains both date and time elements, but
//! the value is only a Date or Time. In this case, we need to truncate the
//! format string to only include the relevant elements. (Otherwise it throws an
//! error.)

use lazy_static::lazy_static;
use std::cmp::Ordering;

use chrono::{
    DateTime, Datelike, NaiveDate, NaiveDateTime, NaiveTime, Timelike, Utc,
    format::{Fixed, Item, Numeric, Parsed, StrftimeItems},
};

mod date_time_convert;
mod wasm;

pub const DEFAULT_DATE_FORMAT: &str = "%m/%d/%Y";
pub const DEFAULT_TIME_FORMAT: &str = "%-I:%M %p";
pub const DEFAULT_DATE_TIME_FORMAT: &str = "%m/%d/%Y %-I:%M %p";

fn is_date_item(item: &Item<'_>) -> bool {
    matches!(
        item,
        Item::Numeric(
            Numeric::Year
                | Numeric::YearDiv100
                | Numeric::YearMod100
                | Numeric::IsoYear
                | Numeric::IsoYearDiv100
                | Numeric::IsoYearMod100
                | Numeric::Month
                | Numeric::Day
                | Numeric::WeekFromSun
                | Numeric::WeekFromMon
                | Numeric::IsoWeek
                | Numeric::NumDaysFromSun
                | Numeric::WeekdayFromMon
                | Numeric::Ordinal,
            _
        ) | Item::Fixed(
            Fixed::ShortMonthName
                | Fixed::LongMonthName
                | Fixed::LongWeekdayName
                | Fixed::ShortWeekdayName
                | Fixed::TimezoneName
                | Fixed::TimezoneOffset
                | Fixed::TimezoneOffsetColon
                | Fixed::TimezoneOffsetColonZ
                | Fixed::TimezoneOffsetDoubleColon
                | Fixed::TimezoneOffsetTripleColon
                | Fixed::TimezoneOffsetZ
        )
    )
}

fn is_time_item(item: &Item<'_>) -> bool {
    matches!(
        item,
        Item::Numeric(
            Numeric::Ordinal
                | Numeric::Hour
                | Numeric::Hour12
                | Numeric::Minute
                | Numeric::Second
                | Numeric::Nanosecond
                | Numeric::Timestamp,
            _
        ) | Item::Fixed(
            Fixed::LowerAmPm
                | Fixed::Nanosecond
                | Fixed::Nanosecond3
                | Fixed::Nanosecond6
                | Fixed::Nanosecond9
                | Fixed::TimezoneName
                | Fixed::TimezoneOffset
                | Fixed::TimezoneOffsetColon
                | Fixed::TimezoneOffsetColonZ
                | Fixed::TimezoneOffsetDoubleColon
                | Fixed::TimezoneOffsetTripleColon
                | Fixed::TimezoneOffsetZ
                | Fixed::UpperAmPm
        )
    )
}

fn is_space_item(item: &Item<'_>) -> bool {
    matches!(item, Item::Space(_))
}

/// Finds the index of the first time item in a strftime format string.
fn find_items_time_start(items: &[Item<'_>]) -> Option<usize> {
    items.iter().position(|i| is_time_item(i))
}

fn find_items_date_start(items: &[Item<'_>]) -> Option<usize> {
    items.iter().position(|i| is_date_item(i))
}

/// Converts a NaiveDateTime to a date and time string using a strftime format string.
pub fn date_time_to_date_time_string(date_time: NaiveDateTime, format: Option<String>) -> String {
    let format = format.map_or(DEFAULT_DATE_TIME_FORMAT.to_string(), |f| f);
    let strftime_items = StrftimeItems::new(&format);
    let Ok(items) = strftime_items.parse() else {
        return date_time.format(DEFAULT_DATE_TIME_FORMAT).to_string();
    };
    date_time.format_with_items(items.iter()).to_string()
}

/// Converts a NaiveDateTime to a date-only string using a strftime format string.
pub fn date_to_date_string(date: NaiveDate, format: Option<String>) -> String {
    let format = format.map_or(DEFAULT_DATE_TIME_FORMAT.to_string(), |f| f);
    let strftime_items = StrftimeItems::new(&format);
    let Ok(mut items) = strftime_items.parse() else {
        return date.format(DEFAULT_DATE_FORMAT).to_string();
    };

    let time_start = find_items_time_start(&items);
    let date_start = find_items_date_start(&items);

    if let (Some(mut time_start), Some(date_start)) = (time_start, date_start) {
        // remove any time items before the date items
        match date_start.cmp(&time_start) {
            Ordering::Less => {
                while time_start > 0 && is_space_item(&items[time_start - 1]) {
                    time_start -= 1;
                }
                items.drain(time_start..);
            }
            Ordering::Greater => {
                let mut date_end = date_start - 1;
                while date_end > 0 && is_space_item(&items[date_end - 1]) {
                    date_end -= 1;
                }
                items.drain(0..=date_end);
            }
            Ordering::Equal => (),
        }
    } else if let (Some(_), None) = (time_start, date_start) {
        // handle case where there are no date items, only time items
        return date.to_string();
    }

    date.format_with_items(items.iter()).to_string()
}

/// Converts a NaiveDateTime to a time-only string using a strftime format string.
pub fn time_to_time_string(time: NaiveTime, format: Option<String>) -> String {
    let format = format.map_or(DEFAULT_DATE_TIME_FORMAT.to_string(), |f| f);
    let strftime_items = StrftimeItems::new(&format);
    let Ok(mut items) = strftime_items.parse() else {
        return time.format(DEFAULT_TIME_FORMAT).to_string();
    };

    let time_start = find_items_time_start(&items);
    let date_start = find_items_date_start(&items);
    if let (Some(mut time_start), Some(mut date_start)) = (time_start, date_start) {
        // remove any space items before the time items
        match time_start.cmp(&date_start) {
            Ordering::Greater => {
                while time_start > 0 && is_space_item(&items[time_start]) {
                    time_start -= 1;
                }
                items.drain(date_start..time_start);
            }
            Ordering::Less => {
                while date_start > 0 && is_space_item(&items[date_start - 1]) {
                    date_start -= 1;
                }
                items.drain(date_start..);
            }
            Ordering::Equal => (),
        }
    } else if date_start.is_some() {
        // handle case where there are no time items, only date items
        return time.to_string();
    }

    // remove any date items before the time items
    time.format_with_items(items.iter()).to_string()
}

/// Parses a time string using a list of possible formats.
pub fn parse_time(value: &str) -> Option<NaiveTime> {
    let formats = [
        "%H:%M:%S",
        "%I:%M:%S %p",
        "%I:%M:%S%p",
        "%I:%M %p",
        "%I:%M%p",
        "%H:%M",
        "%I:%M:%S",
        "%I:%M",
        "%H:%M:%S%.3f",
    ];

    for &format in formats.iter() {
        if let Ok(parsed_time) = NaiveTime::parse_from_str(value, format) {
            return Some(parsed_time);
        }

        // this is a hack to handle the case where the user leaves out minutes in a time
        // e.g. 4pm instead of 4:00pm
        let lowercase = value.to_lowercase();
        let (time_number, am_pm) = if lowercase.contains("pm") {
            (lowercase.replace("pm", "").trim().to_string(), "PM")
        } else if lowercase.contains("am") {
            (lowercase.replace("am", "").trim().to_string(), "AM")
        } else {
            continue;
        };
        if let Ok(parsed_time) =
            NaiveTime::parse_from_str(&format!("{}:00 {}", time_number, am_pm), format)
        {
            return Some(parsed_time);
        }
    }
    None
}

/// Parses a date string using a list of possible formats.
pub fn parse_date(value: &str) -> Option<NaiveDate> {
    // Handle "4/10" for April 10th of the current year. chrono doesn't have a
    // specifier for 1-digit month number, so we have to do this manually.
    if let Some(result) = value.split_once('/').and_then(|(m, d)| {
        let month = m.parse().ok()?;
        let day = d.parse().ok()?;
        NaiveDate::from_ymd_opt(Utc::now().year(), month, day)
    }) {
        return Some(result);
    }

    // chrono's parsing API doesn't support patterns without a specified day, so
    // we use a workaround from https://github.com/chronotope/chrono/issues/191

    const FORMATS: &[&str] = &[
        "%d %b", // Day and abbreviated month name (assumes current year)
        "%d %B", // Day and full month name (assumes current year)
        "%b %d", // Abbreviated month name and day (assumes current year)
        "%B %d", // Full month name and day (assumes current year)
        "%B %Y", // December 2024
        "%b %Y", // Dec 2024
        "%Y %B", // 2024 December
        "%Y %b", // 2024 Dec
        "%Y-%m-%d",
        "%m-%d-%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%Y.%m.%d",
        "%m.%d.%Y",
        "%d.%m.%Y",
        "%Y %m %d",
        "%m %d %Y",
        "%d %m %G",
        "%Y %b %d",
        "%b %d %Y",
        "%d %b %Y",
        "%Y %B %d",
        "%B %d %Y",
        "%d %B %Y",
        "%b %d, %Y",
        "%B %d, %Y", // Added to support "December 23, 2024"
    ];

    lazy_static! {
        static ref FORMATS_AS_STRFTIME_ITEMS: Vec<StrftimeItems<'static>> =
            FORMATS.iter().map(|f| StrftimeItems::new(f)).collect();
    }

    for format in &*FORMATS_AS_STRFTIME_ITEMS {
        let mut parsed = Parsed::new();
        if chrono::format::parse(&mut parsed, value, format.clone()).is_ok() {
            // We allow dates with negative years, but you have to construct
            // them explicitly using a formula. Don't parse them.
            if parsed.year.is_some_and(|y| y < 1) {
                continue;
            }

            // Infer defaults if unspecified in the pattern.
            parsed.year = parsed.year.or(Some(Utc::now().year()));
            parsed.month = parsed.month.or(Some(1));
            parsed.day = parsed.day.or(Some(1));

            if let Ok(parsed_date) = parsed.to_naive_date() {
                return Some(parsed_date);
            }
        }
    }
    None
}

/// Convert the entire time into seconds since midnight
pub fn naive_time_to_i32(time: NaiveTime) -> i32 {
    let hours = time.hour() as i32;
    let minutes = time.minute() as i32;
    let seconds = time.second() as i32;
    hours * 3600 + minutes * 60 + seconds
}

pub fn i32_to_naive_time(time: i32) -> Option<NaiveTime> {
    let hours = time / 3600;
    let minutes = (time % 3600) / 60;
    let seconds = time % 60;
    NaiveTime::from_hms_opt(hours as u32, minutes as u32, seconds as u32)
}

/// Convert a NaiveDateTime to an i64 timestamp.
pub fn naive_date_time_to_i64(date: NaiveDateTime) -> i64 {
    date.and_utc().timestamp()
}

/// Convert a NaiveDate to an i64 timestamp.
pub fn naive_date_to_i64(date: NaiveDate) -> Option<i64> {
    let time = NaiveTime::from_hms_opt(0, 0, 0)?;
    let dt = NaiveDateTime::new(date, time);
    Some(naive_date_time_to_i64(dt))
}

/// Convert an i64 timestamp to a NaiveDate.
pub fn i64_to_naive_date(timestamp: i64) -> Option<NaiveDate> {
    let dt = DateTime::from_timestamp(timestamp, 0)?;
    Some(dt.date_naive())
}

#[cfg(test)]
mod tests {

    use super::*;

    #[test]
    fn time() {
        let date_time = "12/23/2024 4:45 PM".to_string();
        let format = "%m/%d/%Y %-I:%M %p".to_string();

        let date_time = NaiveDateTime::parse_from_str(&date_time, &format).unwrap();
        assert_eq!(
            time_to_time_string(date_time.time(), Some(format)),
            "4:45 PM".to_string()
        );
    }

    #[test]
    fn naive_time_i32() {
        let time = NaiveTime::from_hms_opt(12, 34, 56);
        assert_eq!(naive_time_to_i32(time.unwrap()), 45296);
        assert_eq!(i32_to_naive_time(45296), time);
    }

    #[test]
    fn naive_date_i64() {
        let date = NaiveDate::from_ymd_opt(2024, 12, 23);
        assert_eq!(naive_date_to_i64(date.unwrap()), Some(1734912000));
        assert_eq!(i64_to_naive_date(1734912000), date);
    }

    #[test]
    fn test_parse_date() {
        let parsed_date = parse_date("12/23/2024").unwrap();
        assert_eq!(parsed_date, NaiveDate::from_ymd_opt(2024, 12, 23).unwrap());
        assert_eq!(
            parse_date("12/23/2024"),
            NaiveDate::from_ymd_opt(2024, 12, 23)
        );
        assert_eq!(
            parse_date("2024-12-23"),
            NaiveDate::from_ymd_opt(2024, 12, 23)
        );
        assert_eq!(
            parse_date("23 Dec 2024"),
            NaiveDate::from_ymd_opt(2024, 12, 23)
        );
        assert_eq!(
            parse_date("December 23, 2024"),
            NaiveDate::from_ymd_opt(2024, 12, 23)
        );
        assert_eq!(
            parse_date("2024/12/23"),
            NaiveDate::from_ymd_opt(2024, 12, 23)
        );
        assert_eq!(
            parse_date("jan 1,2024"),
            NaiveDate::from_ymd_opt(2024, 1, 1)
        );
        assert_eq!(parse_date("Jan 2024"), NaiveDate::from_ymd_opt(2024, 1, 1));
        assert_eq!(
            parse_date("4/10"),
            NaiveDate::from_ymd_opt(Utc::now().year(), 4, 10),
        );
        assert_eq!(
            parse_date("4/6"),
            NaiveDate::from_ymd_opt(Utc::now().year(), 4, 6),
        );
        assert_eq!(parse_date("4/99"), None);
        assert_eq!(
            parse_date("4/10/2024"),
            NaiveDate::from_ymd_opt(2024, 4, 10),
        );
        assert_eq!(parse_date("4/6/2024"), NaiveDate::from_ymd_opt(2024, 4, 6));
    }

    #[test]
    fn test_parse_time() {
        let time = "4:45 PM".to_string();
        let parsed_time = parse_time(&time).unwrap();
        assert_eq!(parsed_time, NaiveTime::from_hms_opt(16, 45, 0).unwrap());

        // more test functions are in validation_date_time.rs
    }

    #[test]
    fn parse_simple_times() {
        let time = "4pm".to_string();
        let parsed_time = parse_time(&time).unwrap();
        assert_eq!(parsed_time, NaiveTime::from_hms_opt(16, 0, 0).unwrap());

        let time = "4 pm".to_string();
        let parsed_time = parse_time(&time).unwrap();
        assert_eq!(parsed_time, NaiveTime::from_hms_opt(16, 0, 0).unwrap());
    }

    #[test]
    fn format_date_with_bad_ordering() {
        let date = NaiveDate::from_ymd_opt(2024, 12, 23);
        let format = "%d/%m/%Y %S %m %Y".to_string();
        let formatted_date = date_to_date_string(date.unwrap(), Some(format));
        assert_eq!(formatted_date, "23/12/2024".to_string());
    }

    #[test]
    fn format_time_wrong_order() {
        let time = NaiveTime::from_hms_opt(12, 34, 56).unwrap();
        let format = "%H:%M:%S %A";
        let formatted_time = time_to_time_string(time, Some(format.to_string()));
        assert_eq!(formatted_time, "12:34:56".to_string());
    }

    #[test]
    fn format_time() {
        let time = NaiveTime::from_hms_opt(12, 34, 56).unwrap();
        let format = "%A %H:%M:%S";
        let formatted_time = time_to_time_string(time, Some(format.to_string()));
        assert_eq!(formatted_time, "12:34:56".to_string());
    }

    #[test]
    fn format_date() {
        let date = NaiveDate::from_ymd_opt(2024, 12, 23);
        let format = "%A %d %B %Y %H:%M:%S";
        let formatted_date = date_to_date_string(date.unwrap(), Some(format.to_string()));
        assert_eq!(formatted_date, "Monday 23 December 2024".to_string());
    }

    #[test]
    fn format_date_opposite_order() {
        let date = NaiveDate::from_ymd_opt(2024, 12, 23);
        let format = "%H:%M:%S %Y %B %d %A";
        let formatted_date = date_to_date_string(date.unwrap(), Some(format.to_string()));
        assert_eq!(formatted_date, "2024 December 23 Monday".to_string());
    }

    #[test]
    fn test_parse_date_time() {
        assert_eq!(parse_date("1893-01"), None);
        assert_eq!(parse_date("1902-01"), None);
        assert_eq!(parse_date("101-250"), None);
    }
}

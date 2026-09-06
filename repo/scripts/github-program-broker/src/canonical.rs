use std::cmp::Ordering;

use serde_json::{Map, Number, Value as SerdeValue};

use crate::error::CanonicalError;

#[derive(Clone, Debug, PartialEq)]
pub enum JsonValue {
    Null,
    Bool(bool),
    Number(String),
    String(JsonString),
    Array(Vec<JsonValue>),
    Object(Vec<(JsonString, JsonValue)>),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JsonString {
    units: Vec<u16>,
}

impl JsonString {
    pub fn from_units(units: Vec<u16>) -> Self {
        Self { units }
    }

    pub fn from_text(value: &str) -> Self {
        Self {
            units: value.encode_utf16().collect(),
        }
    }

    pub fn units(&self) -> &[u16] {
        &self.units
    }

    pub fn to_plain_string(&self) -> Result<String, CanonicalError> {
        let mut output = String::new();
        let mut index = 0;
        while index < self.units.len() {
            let unit = self.units[index];
            let character = if (0xd800..=0xdbff).contains(&unit) {
                let Some(&low) = self.units.get(index + 1) else {
                    return Err(CanonicalError::LoneSurrogate);
                };
                if !(0xdc00..=0xdfff).contains(&low) {
                    return Err(CanonicalError::LoneSurrogate);
                }
                let code_point =
                    0x1_0000 + ((u32::from(unit) - 0xd800) << 10) + (u32::from(low) - 0xdc00);
                index += 1;
                char::from_u32(code_point).ok_or(CanonicalError::LoneSurrogate)?
            } else if (0xdc00..=0xdfff).contains(&unit) {
                return Err(CanonicalError::LoneSurrogate);
            } else {
                char::from_u32(u32::from(unit)).ok_or(CanonicalError::ValueInvalid)?
            };
            output.push(character);
            index += 1;
        }
        Ok(output)
    }
}

pub fn parse(bytes: &[u8]) -> Result<JsonValue, CanonicalError> {
    std::str::from_utf8(bytes).map_err(|_| CanonicalError::InvalidUtf8)?;
    let mut parser = Parser { bytes, position: 0 };
    let value = parser.parse_value()?;
    parser.skip_whitespace();
    if parser.position != bytes.len() {
        return Err(CanonicalError::Malformed);
    }
    Ok(value)
}

pub fn parse_canonical(bytes: &[u8]) -> Result<JsonValue, CanonicalError> {
    let value = parse(bytes)?;
    if canonical_bytes(&value) != bytes {
        return Err(CanonicalError::NonCanonical);
    }
    Ok(value)
}

pub fn canonical_bytes(value: &JsonValue) -> Vec<u8> {
    let mut output = String::new();
    write_value(value, &mut output);
    output.into_bytes()
}

pub fn from_serde(value: &SerdeValue) -> Result<JsonValue, CanonicalError> {
    match value {
        SerdeValue::Null => Ok(JsonValue::Null),
        SerdeValue::Bool(value) => Ok(JsonValue::Bool(*value)),
        SerdeValue::Number(value) => value
            .as_f64()
            .map(canonical_number)
            .map(JsonValue::Number)
            .ok_or(CanonicalError::NumberInvalid),
        SerdeValue::String(value) => Ok(JsonValue::String(JsonString::from_text(value))),
        SerdeValue::Array(values) => values
            .iter()
            .map(from_serde)
            .collect::<Result<Vec<_>, _>>()
            .map(JsonValue::Array),
        SerdeValue::Object(values) => values
            .iter()
            .map(|(key, item)| Ok((JsonString::from_text(key), from_serde(item)?)))
            .collect::<Result<Vec<_>, CanonicalError>>()
            .map(JsonValue::Object),
    }
}

pub fn to_serde(value: &JsonValue) -> Result<SerdeValue, CanonicalError> {
    match value {
        JsonValue::Null => Ok(SerdeValue::Null),
        JsonValue::Bool(value) => Ok(SerdeValue::Bool(*value)),
        JsonValue::Number(value) => value
            .parse::<Number>()
            .map(SerdeValue::Number)
            .map_err(|_| CanonicalError::NumberInvalid),
        JsonValue::String(value) => Ok(SerdeValue::String(value.to_plain_string()?)),
        JsonValue::Array(values) => values
            .iter()
            .map(to_serde)
            .collect::<Result<Vec<_>, _>>()
            .map(SerdeValue::Array),
        JsonValue::Object(values) => {
            let mut output = Map::new();
            for (key, item) in values {
                output.insert(key.to_plain_string()?, to_serde(item)?);
            }
            Ok(SerdeValue::Object(output))
        }
    }
}

pub fn canonical_serde_bytes(value: &SerdeValue) -> Result<Vec<u8>, CanonicalError> {
    Ok(canonical_bytes(&from_serde(value)?))
}

struct Parser<'a> {
    bytes: &'a [u8],
    position: usize,
}

impl<'a> Parser<'a> {
    fn parse_value(&mut self) -> Result<JsonValue, CanonicalError> {
        self.skip_whitespace();
        match self.bytes.get(self.position).copied() {
            Some(b'n') => self.literal(b"null", JsonValue::Null),
            Some(b't') => self.literal(b"true", JsonValue::Bool(true)),
            Some(b'f') => self.literal(b"false", JsonValue::Bool(false)),
            Some(b'"') => Ok(JsonValue::String(self.parse_string()?)),
            Some(b'[') => self.parse_array(),
            Some(b'{') => self.parse_object(),
            Some(b'-' | b'0'..=b'9') => self.parse_number(),
            _ => Err(CanonicalError::Malformed),
        }
    }

    fn literal(&mut self, literal: &[u8], value: JsonValue) -> Result<JsonValue, CanonicalError> {
        if self.bytes.get(self.position..self.position + literal.len()) == Some(literal) {
            self.position += literal.len();
            Ok(value)
        } else {
            Err(CanonicalError::Malformed)
        }
    }

    fn parse_array(&mut self) -> Result<JsonValue, CanonicalError> {
        self.position += 1;
        self.skip_whitespace();
        let mut values = Vec::new();
        if self.consume(b']') {
            return Ok(JsonValue::Array(values));
        }
        loop {
            values.push(self.parse_value()?);
            self.skip_whitespace();
            if self.consume(b']') {
                return Ok(JsonValue::Array(values));
            }
            if !self.consume(b',') {
                return Err(CanonicalError::Malformed);
            }
        }
    }

    fn parse_object(&mut self) -> Result<JsonValue, CanonicalError> {
        self.position += 1;
        self.skip_whitespace();
        let mut members: Vec<(JsonString, JsonValue)> = Vec::new();
        if self.consume(b'}') {
            return Ok(JsonValue::Object(members));
        }
        loop {
            self.skip_whitespace();
            if !self.consume(b'"') {
                return Err(CanonicalError::Malformed);
            }
            self.position -= 1;
            let key = self.parse_string()?;
            self.skip_whitespace();
            if !self.consume(b':') {
                return Err(CanonicalError::Malformed);
            }
            let value = self.parse_value()?;
            if members.iter().any(|(existing, _)| existing == &key) {
                return Err(CanonicalError::DuplicateKey);
            }
            members.push((key, value));
            self.skip_whitespace();
            if self.consume(b'}') {
                return Ok(JsonValue::Object(members));
            }
            if !self.consume(b',') {
                return Err(CanonicalError::Malformed);
            }
        }
    }

    fn parse_string(&mut self) -> Result<JsonString, CanonicalError> {
        if !self.consume(b'"') {
            return Err(CanonicalError::Malformed);
        }
        let mut units = Vec::new();
        loop {
            let Some(byte) = self.bytes.get(self.position).copied() else {
                return Err(CanonicalError::Malformed);
            };
            match byte {
                b'"' => {
                    self.position += 1;
                    return Ok(JsonString::from_units(units));
                }
                b'\\' => {
                    self.position += 1;
                    let Some(escape) = self.bytes.get(self.position).copied() else {
                        return Err(CanonicalError::Malformed);
                    };
                    self.position += 1;
                    match escape {
                        b'"' | b'\\' | b'/' => units.push(u16::from(escape)),
                        b'b' => units.push(0x08),
                        b'f' => units.push(0x0c),
                        b'n' => units.push(0x0a),
                        b'r' => units.push(0x0d),
                        b't' => units.push(0x09),
                        b'u' => units.push(self.parse_hex_unit()?),
                        _ => return Err(CanonicalError::Malformed),
                    }
                }
                0..=0x1f => return Err(CanonicalError::Malformed),
                _ => {
                    let remainder = self
                        .bytes
                        .get(self.position..)
                        .ok_or(CanonicalError::Malformed)?;
                    let text =
                        std::str::from_utf8(remainder).map_err(|_| CanonicalError::InvalidUtf8)?;
                    let character = text.chars().next().ok_or(CanonicalError::Malformed)?;
                    if character == '"' || character == '\\' || character.is_control() {
                        return Err(CanonicalError::Malformed);
                    }
                    let mut encoded = [0u16; 2];
                    let encoded = character.encode_utf16(&mut encoded);
                    units.extend_from_slice(encoded);
                    self.position += character.len_utf8();
                }
            }
        }
    }

    fn parse_hex_unit(&mut self) -> Result<u16, CanonicalError> {
        let digits = self
            .bytes
            .get(self.position..self.position + 4)
            .ok_or(CanonicalError::Malformed)?;
        if !digits.iter().all(|digit| digit.is_ascii_hexdigit()) {
            return Err(CanonicalError::Malformed);
        }
        self.position += 4;
        u16::from_str_radix(std::str::from_utf8(digits).unwrap_or_default(), 16)
            .map_err(|_| CanonicalError::Malformed)
    }

    fn parse_number(&mut self) -> Result<JsonValue, CanonicalError> {
        let start = self.position;
        self.consume(b'-');
        match self.bytes.get(self.position).copied() {
            Some(b'0') => {
                self.position += 1;
                if matches!(self.bytes.get(self.position), Some(b'0'..=b'9')) {
                    return Err(CanonicalError::NumberInvalid);
                }
            }
            Some(b'1'..=b'9') => {
                self.position += 1;
                while matches!(self.bytes.get(self.position), Some(b'0'..=b'9')) {
                    self.position += 1;
                }
            }
            _ => return Err(CanonicalError::NumberInvalid),
        }
        if self.consume(b'.') {
            let fraction_start = self.position;
            while matches!(self.bytes.get(self.position), Some(b'0'..=b'9')) {
                self.position += 1;
            }
            if self.position == fraction_start {
                return Err(CanonicalError::NumberInvalid);
            }
        }
        if matches!(self.bytes.get(self.position), Some(b'e' | b'E')) {
            self.position += 1;
            if !self.consume(b'+') {
                self.consume(b'-');
            }
            let exponent_start = self.position;
            while matches!(self.bytes.get(self.position), Some(b'0'..=b'9')) {
                self.position += 1;
            }
            if self.position == exponent_start {
                return Err(CanonicalError::NumberInvalid);
            }
        }
        let number = std::str::from_utf8(&self.bytes[start..self.position])
            .map_err(|_| CanonicalError::InvalidUtf8)?;
        let parsed = number
            .parse::<f64>()
            .map_err(|_| CanonicalError::NumberInvalid)?;
        if !parsed.is_finite() {
            return Err(CanonicalError::NumberInvalid);
        }
        Ok(JsonValue::Number(canonical_number(parsed)))
    }

    fn skip_whitespace(&mut self) {
        while matches!(
            self.bytes.get(self.position),
            Some(b' ' | b'\n' | b'\r' | b'\t')
        ) {
            self.position += 1;
        }
    }

    fn consume(&mut self, expected: u8) -> bool {
        if self.bytes.get(self.position) == Some(&expected) {
            self.position += 1;
            true
        } else {
            false
        }
    }
}

fn canonical_number(value: f64) -> String {
    if value == 0.0 {
        return "0".to_owned();
    }
    let raw = value.to_string().replace('E', "e");
    let (negative, body) = raw
        .strip_prefix('-')
        .map_or((false, raw.as_str()), |body| (true, body));
    let (mantissa, explicit_exponent) = body
        .split_once('e')
        .map_or((body, 0), |(mantissa, exponent)| {
            (mantissa, exponent.parse::<i32>().unwrap_or(0))
        });
    let integer_digits = mantissa.find('.').unwrap_or(mantissa.len());
    let mut digits: String = mantissa
        .chars()
        .filter(|character| *character != '.')
        .collect();
    let first_nonzero = digits.find(|character: char| character != '0').unwrap_or(0);
    let exponent = explicit_exponent + integer_digits as i32 - first_nonzero as i32 - 1;
    digits.drain(..first_nonzero);
    while digits.ends_with('0') {
        digits.pop();
    }
    let sign = if negative { "-" } else { "" };
    if value.abs() >= 1e-6 && value.abs() < 1e21 {
        let decimal_position = exponent + 1;
        if decimal_position <= 0 {
            return format!(
                "{sign}0.{}{}",
                "0".repeat((-decimal_position) as usize),
                digits
            );
        }
        let decimal_position = decimal_position as usize;
        if decimal_position >= digits.len() {
            return format!(
                "{sign}{}{}",
                digits,
                "0".repeat(decimal_position - digits.len())
            );
        }
        return format!(
            "{sign}{}.{}",
            &digits[..decimal_position],
            &digits[decimal_position..]
        );
    }
    let scientific_mantissa = if digits.len() == 1 {
        digits
    } else {
        format!("{}.{}", &digits[..1], &digits[1..])
    };
    format!(
        "{sign}{scientific_mantissa}e{}{}",
        if exponent >= 0 { "+" } else { "" },
        exponent
    )
}

fn write_value(value: &JsonValue, output: &mut String) {
    match value {
        JsonValue::Null => output.push_str("null"),
        JsonValue::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
        JsonValue::Number(value) => output.push_str(value),
        JsonValue::String(value) => write_string(value, output),
        JsonValue::Array(values) => {
            output.push('[');
            for (index, value) in values.iter().enumerate() {
                if index != 0 {
                    output.push(',');
                }
                write_value(value, output);
            }
            output.push(']');
        }
        JsonValue::Object(values) => {
            let mut members: Vec<_> = values.iter().collect();
            members.sort_by(|left, right| compare_units(&left.0, &right.0));
            output.push('{');
            for (index, (key, value)) in members.into_iter().enumerate() {
                if index != 0 {
                    output.push(',');
                }
                write_string(key, output);
                output.push(':');
                write_value(value, output);
            }
            output.push('}');
        }
    }
}

fn compare_units(left: &JsonString, right: &JsonString) -> Ordering {
    left.units.cmp(&right.units)
}

fn write_string(value: &JsonString, output: &mut String) {
    output.push('"');
    let mut index = 0;
    while index < value.units.len() {
        let unit = value.units[index];
        if (0xd800..=0xdbff).contains(&unit) {
            if let Some(&low) = value.units.get(index + 1)
                && (0xdc00..=0xdfff).contains(&low)
            {
                let code_point =
                    0x1_0000 + ((u32::from(unit) - 0xd800) << 10) + (u32::from(low) - 0xdc00);
                if let Some(character) = char::from_u32(code_point) {
                    output.push(character);
                    index += 2;
                    continue;
                }
            }
            write_unicode_escape(unit, output);
            index += 1;
            continue;
        }
        if (0xdc00..=0xdfff).contains(&unit) {
            write_unicode_escape(unit, output);
            index += 1;
            continue;
        }
        let character = char::from_u32(u32::from(unit)).unwrap_or('\u{fffd}');
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\u{08}' => output.push_str("\\b"),
            '\u{0c}' => output.push_str("\\f"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            character if character.is_control() => write_unicode_escape(unit, output),
            character => output.push(character),
        }
        index += 1;
    }
    output.push('"');
}

fn write_unicode_escape(unit: u16, output: &mut String) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    output.push_str("\\u");
    output.push(HEX[((unit >> 12) & 0xf) as usize] as char);
    output.push(HEX[((unit >> 8) & 0xf) as usize] as char);
    output.push(HEX[((unit >> 4) & 0xf) as usize] as char);
    output.push(HEX[(unit & 0xf) as usize] as char);
}

use std::{fmt, str::FromStr};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{Pos, Rect};

use super::{
    A1Context, A1Error, CellRefCoord, CellRefRangeEnd, RefRangeBounds, TableRef, UNBOUNDED,
};

mod col_row;
mod create;
mod display;
mod intersects;
mod mutate;
mod query;
mod to_table_ref;

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Hash, TS)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(untagged)]
pub enum CellRefRange {
    Sheet { range: RefRangeBounds },
    Table { range: TableRef },
}

impl CellRefRange {
    pub const ALL: Self = Self::Sheet {
        range: RefRangeBounds::ALL,
    };
}

impl CellRefRange {
    #[cfg(test)]
    pub fn test_a1(a1: &str) -> Self {
        use std::str::FromStr;

        Self::Sheet {
            range: RefRangeBounds::from_str(a1).unwrap(),
        }
    }

    /// Converts the reference to a string, preferring A1 notation.
    pub fn to_a1_string(&self) -> String {
        match self {
            CellRefRange::Sheet { range } => range.to_string(),
            CellRefRange::Table { range } => range.to_string(),
        }
    }

    /// Converts the reference to a string, preferring RC notation.
    pub fn to_rc_string(&self, base_pos: Pos) -> String {
        match self {
            CellRefRange::Sheet { range } => range.to_rc_string(base_pos),
            CellRefRange::Table { range } => range.to_string(),
        }
    }

    pub fn new_sheet_ref(
        x1: CellRefCoord,
        y1: CellRefCoord,
        x2: CellRefCoord,
        y2: CellRefCoord,
    ) -> Self {
        Self::Sheet {
            range: RefRangeBounds {
                start: CellRefRangeEnd { col: x1, row: y1 },
                end: CellRefRangeEnd { col: x2, row: y2 },
            },
        }
    }
}

# Google filter view export probe (2026-11-26)

addFilterView 'Big counts' over A1:B5, sort col B desc, B > 2; Drive export.

## xlsx sheet1.xml
<customSheetViews><customSheetView guid="{EF5DA6A6-1AAC-49A9-B8A8-84C5D3C7AC05}" filter="1" showAutoFilter="1"><autoFilter ref="$A$1:$B$5"><filterColumn colId="1"><customFilters><customFilter operator="greaterThan" val="2"/></customFilters></filterColumn><sortState ref="A1:B5"><sortCondition descending="1" ref="B1:B5"/></sortState></autoFilter></customSheetView></customSheetViews>

## xlsx workbook.xml
<definedNames><definedName hidden="1" localSheetId="0" name="Z_EF5DA6A6_1AAC_49A9_B8A8_84C5D3C7AC05_.wvu.FilterData">'livedoc filter view probe'!$A$1:$B$5</definedName></definedNames><calcPr/><customWorkbookViews><customWorkbookView activeSheetId="0" maximized="1" windowHeight="0" windowWidth="0" guid="{EF5DA6A6-1AAC-49A9-B8A8-84C5D3C7AC05}" name="Big counts"/></customWorkbookViews>

## ods: no trace (no database-range, no name) in content.xml, styles.xml, settings.xml

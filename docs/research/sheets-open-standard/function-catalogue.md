# Function catalogue: Google Sheets, OpenFormula and LiveDoc

Follow the references below only as needed; never upfront.

Every function name from three authorities, one row each, measured 2026-11-18.

- **Google**: the category on Google's function list ([support.google.com/docs/table/25273](https://support.google.com/docs/table/25273?hl=en)), 514 names (verified: parsed from the page).
- **OpenFormula**: the group of ODF 1.4 Part 4 ([OpenDocument-v1.4-part4-formula](https://docs.oasis-open.org/office/OpenDocument/v1.4/OpenDocument-v1.4-part4-formula.html) §2.3.2 to §2.3.4) that requires it; "Documented, no group" for those the part defines outside every group (`CELL`, `DOLLAR`, and functions only named in sections); 393 names (verified: parsed from the headings).
- **ODFF name**: how the function is written inside an ODF file: the OpenFormula name, else the namespaced name LibreOffice reads and writes (`COM.MICROSOFT.*`, `ORG.LIBREOFFICE.*`, `ORG.OPENOFFICE.*`) from [core_resource.hrc](https://github.com/LibreOffice/core/blob/master/formula/inc/core_resource.hrc) (verified: parsed, master on 2026-11-18). Empty: no application on record writes it; LiveDoc would need its own namespace (Phase 3 names it).
- **Here**: the family in `@livedoc/sheets` today (`FUNCTION_FAMILIES`, 157 names; verified: read from the registry).

## Counts

- In Google and OpenFormula: 364. In Google only: 150, of which 98 LibreOffice writes under a namespace and 52 have no ODFF name at all. In OpenFormula only: 29 (Bessel functions, `LEGACY.*`, `DDE`, `EUROCONVERT`, `MULTIPLE.OPERATIONS`, `ODD*` bond prices, `NUMBERVALUE` among them).
- Here and in Google: 151. Here and not on Google's list: `XMATCH`, `SORTBY`, `CARDCOUNT`, `CARDSUM`, `CARD`, `CARDS` (`XMATCH` and `SORTBY` are missing from Google's list page; whether Sheets evaluates them is assumed yes and checked against the oracle in Phase 6).
- Google's names not built here: 363.

## Google only, with no ODFF name

`EPOCHTODATE`, `IMCOTH`, `IMLOG`, `IMTANH`, `SORTN`, `ARRAYFORMULA`, `DETECTLANGUAGE`, `GOOGLEFINANCE`, `GOOGLETRANSLATE`, `IMAGE`, `QUERY`, `SPARKLINE`, `ISDATE`, `ISEMAIL`, `FORMULATEXT`, `COUNTUNIQUE`, `ADD`, `DIVIDE`, `EQ`, `GT`, `GTE`, `ISBETWEEN`, `LT`, `LTE`, `MINUS`, `MULTIPLY`, `NE`, `POW`, `UMINUS`, `UNARY_PERCENT`, `UPLUS`, `AVERAGE.WEIGHTED`, `MARGINOFERROR`, `SKEW.P`, `JOIN`, `REGEXEXTRACT`, `REGEXMATCH`, `REGEXREPLACE`, `SPLIT`, `TO_DATE`, `TO_DOLLARS`, `TO_PERCENT`, `TO_PURE_NUMBER`, `TO_TEXT`, `ARRAY_CONSTRAIN`, `FLATTEN`, `IMPORTDATA`, `IMPORTFEED`, `IMPORTHTML`, `IMPORTRANGE`, `IMPORTXML`, `ISURL`

## The catalogue

| Name                  | Google      | OpenFormula          | ODFF name                        | Here          |
| --------------------- | ----------- | -------------------- | -------------------------------- | ------------- |
| `ABS`                 | Math        | Small                | `ABS`                            | Maths         |
| `ACCRINT`             | Financial   | Medium               | `ACCRINT`                        |               |
| `ACCRINTM`            | Financial   | Medium               | `ACCRINTM`                       |               |
| `ACOS`                | Math        | Small                | `ACOS`                           |               |
| `ACOSH`               | Math        | Medium               | `ACOSH`                          |               |
| `ACOT`                | Math        | Medium               | `ACOT`                           |               |
| `ACOTH`               | Math        | Medium               | `ACOTH`                          |               |
| `ADD`                 | Operator    |                      |                                  |               |
| `ADDRESS`             | Lookup      | Medium               | `ADDRESS`                        |               |
| `AMORLINC`            | Financial   | Large                | `AMORLINC`                       |               |
| `AND`                 | Logical     | Small                | `AND`                            | Logic         |
| `ARABIC`              | Text        | Large                | `ARABIC`                         |               |
| `AREAS`               |             | Large                | `AREAS`                          |               |
| `ARRAYFORMULA`        | Google      |                      |                                  | Arrays        |
| `ARRAY_CONSTRAIN`     | Array       |                      |                                  |               |
| `ASC`                 | Text        | Large                | `ASC`                            |               |
| `ASIN`                | Math        | Small                | `ASIN`                           |               |
| `ASINH`               | Math        | Medium               | `ASINH`                          |               |
| `ATAN`                | Math        | Small                | `ATAN`                           |               |
| `ATAN2`               | Math        | Small                | `ATAN2`                          |               |
| `ATANH`               | Math        | Medium               | `ATANH`                          |               |
| `AVEDEV`              | Statistical | Medium               | `AVEDEV`                         |               |
| `AVERAGE`             | Statistical | Small                | `AVERAGE`                        | Statistics    |
| `AVERAGE.WEIGHTED`    | Statistical |                      |                                  |               |
| `AVERAGEA`            | Statistical | Large                | `AVERAGEA`                       |               |
| `AVERAGEIF`           | Statistical | Small                | `AVERAGEIF`                      | Statistics    |
| `AVERAGEIFS`          | Statistical | Large                | `AVERAGEIFS`                     | Statistics    |
| `BASE`                | Math        | Large                | `BASE`                           |               |
| `BESSELI`             |             | Medium               | `BESSELI`                        |               |
| `BESSELJ`             |             | Medium               | `BESSELJ`                        |               |
| `BESSELK`             |             | Medium               | `BESSELK`                        |               |
| `BESSELY`             |             | Medium               | `BESSELY`                        |               |
| `BETA.DIST`           | Statistical |                      | `COM.MICROSOFT.BETA.DIST`        |               |
| `BETA.INV`            | Statistical |                      | `COM.MICROSOFT.BETA.INV`         |               |
| `BETADIST`            | Statistical | Medium               | `BETADIST`                       |               |
| `BETAINV`             | Statistical | Medium               | `BETAINV`                        |               |
| `BIN2DEC`             | Engineering | Large                | `BIN2DEC`                        |               |
| `BIN2HEX`             | Engineering | Large                | `BIN2HEX`                        |               |
| `BIN2OCT`             | Engineering | Large                | `BIN2OCT`                        |               |
| `BINOM.DIST`          | Statistical |                      | `COM.MICROSOFT.BINOM.DIST`       |               |
| `BINOM.DIST.RANGE`    |             | Large                | `BINOM.DIST.RANGE`               |               |
| `BINOM.INV`           | Statistical |                      | `COM.MICROSOFT.BINOM.INV`        |               |
| `BINOMDIST`           | Statistical | Medium               | `BINOMDIST`                      |               |
| `BITAND`              | Engineering | Large                | `BITAND`                         |               |
| `BITLSHIFT`           | Engineering | Large                | `BITLSHIFT`                      |               |
| `BITOR`               | Engineering | Large                | `BITOR`                          |               |
| `BITRSHIFT`           | Engineering | Large                | `BITRSHIFT`                      |               |
| `BITXOR`              | Engineering | Large                | `BITXOR`                         |               |
| `BYCOL`               | Array       |                      | `COM.MICROSOFT.BYCOL`            |               |
| `BYROW`               | Array       |                      | `COM.MICROSOFT.BYROW`            |               |
| `CARD`                |             |                      |                                  | Plan cards    |
| `CARDCOUNT`           |             |                      |                                  | Plan cards    |
| `CARDS`               |             |                      |                                  | Plan cards    |
| `CARDSUM`             |             |                      |                                  | Plan cards    |
| `CEILING`             | Math        | Medium               | `CEILING`                        | Maths         |
| `CEILING.MATH`        | Math        |                      | `COM.MICROSOFT.CEILING.MATH`     |               |
| `CEILING.PRECISE`     | Math        |                      | `COM.MICROSOFT.CEILING.PRECISE`  |               |
| `CELL`                | Info        | Documented, no group | `CELL`                           |               |
| `CHAR`                | Text        | Medium               | `CHAR`                           | Text          |
| `CHIDIST`             | Statistical |                      | `LEGACY.CHIDIST`                 |               |
| `CHIINV`              | Statistical |                      | `LEGACY.CHIINV`                  |               |
| `CHISQ.DIST`          | Statistical |                      | `COM.MICROSOFT.CHISQ.DIST`       |               |
| `CHISQ.DIST.RT`       | Statistical |                      | `COM.MICROSOFT.CHISQ.DIST.RT`    |               |
| `CHISQ.INV`           | Statistical |                      | `COM.MICROSOFT.CHISQ.INV`        |               |
| `CHISQ.INV.RT`        | Statistical |                      | `COM.MICROSOFT.CHISQ.INV.RT`     |               |
| `CHISQ.TEST`          | Statistical |                      | `COM.MICROSOFT.CHISQ.TEST`       |               |
| `CHISQDIST`           |             | Large                | `CHISQDIST`                      |               |
| `CHISQINV`            |             | Large                | `CHISQINV`                       |               |
| `CHITEST`             | Statistical |                      | `LEGACY.CHITEST`                 |               |
| `CHOOSE`              | Lookup      | Small                | `CHOOSE`                         | Lookup        |
| `CHOOSECOLS`          | Array       |                      | `COM.MICROSOFT.CHOOSECOLS`       |               |
| `CHOOSEROWS`          | Array       |                      | `COM.MICROSOFT.CHOOSEROWS`       |               |
| `CLEAN`               | Text        | Medium               | `CLEAN`                          | Text          |
| `CODE`                | Text        | Medium               | `CODE`                           | Text          |
| `COLUMN`              | Lookup      | Medium               | `COLUMN`                         | Lookup        |
| `COLUMNS`             | Lookup      | Small                | `COLUMNS`                        | Lookup        |
| `COMBIN`              | Math        | Medium               | `COMBIN`                         |               |
| `COMBINA`             | Math        | Large                | `COMBINA`                        |               |
| `COMPLEX`             | Engineering | Large                | `COMPLEX`                        |               |
| `CONCAT`              | Operator    |                      | `COM.MICROSOFT.CONCAT`           | Text          |
| `CONCATENATE`         | Text        | Medium               | `CONCATENATE`                    | Text          |
| `CONFIDENCE`          | Statistical | Medium               | `CONFIDENCE`                     |               |
| `CONFIDENCE.NORM`     | Statistical |                      | `COM.MICROSOFT.CONFIDENCE.NORM`  |               |
| `CONFIDENCE.T`        | Statistical |                      | `COM.MICROSOFT.CONFIDENCE.T`     |               |
| `CONVERT`             | Parser      | Medium               | `CONVERT`                        |               |
| `CORREL`              | Statistical | Medium               | `CORREL`                         | Statistics    |
| `COS`                 | Math        | Small                | `COS`                            |               |
| `COSH`                | Math        | Medium               | `COSH`                           |               |
| `COT`                 | Math        | Medium               | `COT`                            |               |
| `COTH`                | Math        | Medium               | `COTH`                           |               |
| `COUNT`               | Statistical | Small                | `COUNT`                          | Statistics    |
| `COUNTA`              | Statistical | Small                | `COUNTA`                         | Statistics    |
| `COUNTBLANK`          | Math        | Small                | `COUNTBLANK`                     | Statistics    |
| `COUNTIF`             | Math        | Small                | `COUNTIF`                        | Statistics    |
| `COUNTIFS`            | Math        | Large                | `COUNTIFS`                       | Statistics    |
| `COUNTUNIQUE`         | Math        |                      |                                  |               |
| `COUPDAYBS`           | Financial   | Medium               | `COUPDAYBS`                      |               |
| `COUPDAYS`            | Financial   | Medium               | `COUPDAYS`                       |               |
| `COUPDAYSNC`          | Financial   | Medium               | `COUPDAYSNC`                     |               |
| `COUPNCD`             | Financial   | Medium               | `COUPNCD`                        |               |
| `COUPNUM`             | Financial   | Medium               | `COUPNUM`                        |               |
| `COUPPCD`             | Financial   | Medium               | `COUPPCD`                        |               |
| `COVAR`               | Statistical | Medium               | `COVAR`                          |               |
| `COVARIANCE.P`        | Statistical |                      | `COM.MICROSOFT.COVARIANCE.P`     |               |
| `COVARIANCE.S`        | Statistical |                      | `COM.MICROSOFT.COVARIANCE.S`     |               |
| `CRITBINOM`           | Statistical | Medium               | `CRITBINOM`                      |               |
| `CSC`                 | Math        | Large                | `CSC`                            |               |
| `CSCH`                | Math        | Large                | `CSCH`                           |               |
| `CUMIPMT`             | Financial   | Medium               | `CUMIPMT`                        |               |
| `CUMPRINC`            | Financial   | Medium               | `CUMPRINC`                       |               |
| `DATE`                | Date        | Small                | `DATE`                           | Date and time |
| `DATEDIF`             | Date        | Large                | `DATEDIF`                        | Date and time |
| `DATEVALUE`           | Date        | Medium               | `DATEVALUE`                      | Date and time |
| `DAVERAGE`            | Database    | Small                | `DAVERAGE`                       |               |
| `DAY`                 | Date        | Small                | `DAY`                            | Date and time |
| `DAYS`                | Date        | Large                | `DAYS`                           | Date and time |
| `DAYS360`             | Date        | Medium               | `DAYS360`                        |               |
| `DB`                  | Financial   | Medium               | `DB`                             |               |
| `DCOUNT`              | Database    | Small                | `DCOUNT`                         |               |
| `DCOUNTA`             | Database    | Small                | `DCOUNTA`                        |               |
| `DDB`                 | Financial   | Small                | `DDB`                            |               |
| `DDE`                 |             | Large                | `DDE`                            |               |
| `DEC2BIN`             | Engineering | Large                | `DEC2BIN`                        |               |
| `DEC2HEX`             | Engineering | Large                | `DEC2HEX`                        |               |
| `DEC2OCT`             | Engineering | Large                | `DEC2OCT`                        |               |
| `DECIMAL`             | Math        | Large                | `DECIMAL`                        |               |
| `DEGREES`             | Math        | Small                | `DEGREES`                        |               |
| `DELTA`               | Engineering | Large                | `DELTA`                          |               |
| `DETECTLANGUAGE`      | Google      |                      |                                  |               |
| `DEVSQ`               | Statistical | Medium               | `DEVSQ`                          |               |
| `DGET`                | Database    | Small                | `DGET`                           |               |
| `DISC`                | Financial   | Medium               | `DISC`                           |               |
| `DIVIDE`              | Operator    |                      |                                  |               |
| `DMAX`                | Database    | Small                | `DMAX`                           |               |
| `DMIN`                | Database    | Small                | `DMIN`                           |               |
| `DOLLAR`              | Text        | Documented, no group | `DOLLAR`                         |               |
| `DOLLARDE`            | Financial   | Medium               | `DOLLARDE`                       |               |
| `DOLLARFR`            | Financial   | Medium               | `DOLLARFR`                       |               |
| `DPRODUCT`            | Database    | Small                | `DPRODUCT`                       |               |
| `DSTDEV`              | Database    | Small                | `DSTDEV`                         |               |
| `DSTDEVP`             | Database    | Small                | `DSTDEVP`                        |               |
| `DSUM`                | Database    | Small                | `DSUM`                           |               |
| `DURATION`            | Financial   | Medium               | `DURATION`                       |               |
| `DVAR`                | Database    | Small                | `DVAR`                           |               |
| `DVARP`               | Database    | Small                | `DVARP`                          |               |
| `EASTERSUNDAY`        |             | Documented, no group | `EASTERSUNDAY`                   |               |
| `EDATE`               | Date        | Large                | `EDATE`                          | Date and time |
| `EFFECT`              | Financial   | Medium               | `EFFECT`                         |               |
| `ENCODEURL`           | Web         |                      | `COM.MICROSOFT.ENCODEURL`        |               |
| `EOMONTH`             | Date        | Medium               | `EOMONTH`                        | Date and time |
| `EPOCHTODATE`         | Date        |                      |                                  |               |
| `EQ`                  | Operator    |                      |                                  |               |
| `ERF`                 | Engineering | Medium               | `ERF`                            |               |
| `ERF.PRECISE`         | Engineering |                      | `COM.MICROSOFT.ERF.PRECISE`      |               |
| `ERFC`                | Math        | Medium               | `ERFC`                           |               |
| `ERFC.PRECISE`        | Math        |                      | `COM.MICROSOFT.ERFC.PRECISE`     |               |
| `ERROR.TYPE`          | Info        | Large                | `ERROR.TYPE`                     | Information   |
| `EUROCONVERT`         |             | Large                | `EUROCONVERT`                    |               |
| `EVEN`                | Math        | Small                | `EVEN`                           |               |
| `EXACT`               | Text        | Small                | `EXACT`                          | Text          |
| `EXP`                 | Math        | Small                | `EXP`                            | Maths         |
| `EXPON.DIST`          | Statistical |                      | `COM.MICROSOFT.EXPON.DIST`       |               |
| `EXPONDIST`           | Statistical | Medium               | `EXPONDIST`                      |               |
| `F.DIST`              | Statistical |                      | `FDIST`                          |               |
| `F.DIST.RT`           | Statistical |                      | `COM.MICROSOFT.F.DIST.RT`        |               |
| `F.INV`               | Statistical |                      | `FINV`                           |               |
| `F.INV.RT`            | Statistical |                      | `COM.MICROSOFT.F.INV.RT`         |               |
| `F.TEST`              | Statistical |                      | `COM.MICROSOFT.F.TEST`           |               |
| `FACT`                | Math        | Small                | `FACT`                           | Maths         |
| `FACTDOUBLE`          | Math        | Large                | `FACTDOUBLE`                     |               |
| `FALSE`               | Logical     | Small                | `FALSE`                          | Logic         |
| `FDIST`               | Statistical | Large                | `FDIST`                          |               |
| `FILTER`              | Filter      |                      | `COM.MICROSOFT.FILTER`           | Arrays        |
| `FIND`                | Text        | Small                | `FIND`                           | Text          |
| `FINDB`               | Text        | Large                | `FINDB`                          |               |
| `FINV`                | Statistical | Large                | `FINV`                           |               |
| `FISHER`              | Statistical | Medium               | `FISHER`                         |               |
| `FISHERINV`           | Statistical | Medium               | `FISHERINV`                      |               |
| `FIXED`               | Text        | Medium               | `FIXED`                          |               |
| `FLATTEN`             | Array       |                      |                                  |               |
| `FLOOR`               | Math        | Medium               | `FLOOR`                          | Maths         |
| `FLOOR.MATH`          | Math        |                      | `COM.MICROSOFT.FLOOR.MATH`       |               |
| `FLOOR.PRECISE`       | Math        |                      | `COM.MICROSOFT.FLOOR.PRECISE`    |               |
| `FORECAST`            | Statistical | Medium               | `FORECAST`                       |               |
| `FORECAST.LINEAR`     | Statistical |                      | `COM.MICROSOFT.FORECAST.LINEAR`  |               |
| `FORMULA`             |             | Large                | `FORMULA`                        |               |
| `FORMULATEXT`         | Lookup      |                      |                                  |               |
| `FREQUENCY`           | Array       | Large                | `FREQUENCY`                      |               |
| `FTEST`               | Statistical | Medium               | `FTEST`                          |               |
| `FV`                  | Financial   | Small                | `FV`                             | Finance       |
| `FVSCHEDULE`          | Financial   | Large                | `FVSCHEDULE`                     |               |
| `GAMMA`               | Statistical | Large                | `GAMMA`                          |               |
| `GAMMA.DIST`          | Statistical |                      | `COM.MICROSOFT.GAMMA.DIST`       |               |
| `GAMMA.INV`           | Statistical |                      | `COM.MICROSOFT.GAMMA.INV`        |               |
| `GAMMADIST`           | Statistical | Medium               | `GAMMADIST`                      |               |
| `GAMMAINV`            | Statistical | Medium               | `GAMMAINV`                       |               |
| `GAMMALN`             | Math        | Medium               | `GAMMALN`                        |               |
| `GAMMALN.PRECISE`     | Math        |                      | `COM.MICROSOFT.GAMMALN.PRECISE`  |               |
| `GAUSS`               | Statistical | Large                | `GAUSS`                          |               |
| `GCD`                 | Math        | Medium               | `GCD`                            | Maths         |
| `GEOMEAN`             | Statistical | Medium               | `GEOMEAN`                        |               |
| `GESTEP`              | Engineering | Large                | `GESTEP`                         |               |
| `GETPIVOTDATA`        | Lookup      | Large                | `GETPIVOTDATA`                   |               |
| `GOOGLEFINANCE`       | Google      |                      |                                  |               |
| `GOOGLETRANSLATE`     | Google      |                      |                                  |               |
| `GROWTH`              | Array       | Large                | `GROWTH`                         |               |
| `GT`                  | Operator    |                      |                                  |               |
| `GTE`                 | Operator    |                      |                                  |               |
| `HARMEAN`             | Statistical | Medium               | `HARMEAN`                        |               |
| `HEX2BIN`             | Engineering | Large                | `HEX2BIN`                        |               |
| `HEX2DEC`             | Engineering | Large                | `HEX2DEC`                        |               |
| `HEX2OCT`             | Engineering | Large                | `HEX2OCT`                        |               |
| `HLOOKUP`             | Lookup      | Small                | `HLOOKUP`                        | Lookup        |
| `HOUR`                | Date        | Small                | `HOUR`                           | Date and time |
| `HSTACK`              | Array       |                      | `COM.MICROSOFT.HSTACK`           |               |
| `HYPERLINK`           | Web         | Large                | `HYPERLINK`                      | Text          |
| `HYPGEOM.DIST`        | Statistical |                      | `COM.MICROSOFT.HYPGEOM.DIST`     |               |
| `HYPGEOMDIST`         | Statistical | Medium               | `HYPGEOMDIST`                    |               |
| `IF`                  | Logical     | Small                | `IF`                             | Logic         |
| `IFERROR`             | Logical     | Large                | `IFERROR`                        | Logic         |
| `IFNA`                | Logical     | Large                | `IFNA`                           | Logic         |
| `IFS`                 | Logical     |                      | `COM.MICROSOFT.IFS`              | Logic         |
| `IMABS`               | Engineering | Large                | `IMABS`                          |               |
| `IMAGE`               | Google      |                      |                                  |               |
| `IMAGINARY`           | Engineering | Large                | `IMAGINARY`                      |               |
| `IMARGUMENT`          | Engineering | Large                | `IMARGUMENT`                     |               |
| `IMCONJUGATE`         | Engineering | Large                | `IMCONJUGATE`                    |               |
| `IMCOS`               | Engineering | Large                | `IMCOS`                          |               |
| `IMCOSH`              | Engineering | Documented, no group | `IMCOSH`                         |               |
| `IMCOT`               | Engineering | Large                | `IMCOT`                          |               |
| `IMCOTH`              | Engineering |                      |                                  |               |
| `IMCSC`               | Engineering | Large                | `IMCSC`                          |               |
| `IMCSCH`              | Engineering | Large                | `IMCSCH`                         |               |
| `IMDIV`               | Engineering | Large                | `IMDIV`                          |               |
| `IMEXP`               | Engineering | Large                | `IMEXP`                          |               |
| `IMLN`                | Math        | Large                | `IMLN`                           |               |
| `IMLOG`               | Engineering |                      |                                  |               |
| `IMLOG10`             | Engineering | Large                | `IMLOG10`                        |               |
| `IMLOG2`              | Engineering | Large                | `IMLOG2`                         |               |
| `IMPORTDATA`          | Web         |                      |                                  |               |
| `IMPORTFEED`          | Web         |                      |                                  |               |
| `IMPORTHTML`          | Web         |                      |                                  |               |
| `IMPORTRANGE`         | Web         |                      |                                  |               |
| `IMPORTXML`           | Web         |                      |                                  |               |
| `IMPOWER`             | Math        | Large                | `IMPOWER`                        |               |
| `IMPRODUCT`           | Engineering | Large                | `IMPRODUCT`                      |               |
| `IMREAL`              | Engineering | Large                | `IMREAL`                         |               |
| `IMSEC`               | Engineering | Large                | `IMSEC`                          |               |
| `IMSECH`              | Engineering | Large                | `IMSECH`                         |               |
| `IMSIN`               | Engineering | Large                | `IMSIN`                          |               |
| `IMSINH`              | Engineering | Documented, no group | `IMSINH`                         |               |
| `IMSQRT`              | Math        | Large                | `IMSQRT`                         |               |
| `IMSUB`               | Engineering | Large                | `IMSUB`                          |               |
| `IMSUM`               | Engineering | Large                | `IMSUM`                          |               |
| `IMTAN`               | Engineering | Large                | `IMTAN`                          |               |
| `IMTANH`              | Engineering |                      |                                  |               |
| `INDEX`               | Lookup      | Small                | `INDEX`                          | Lookup        |
| `INDIRECT`            | Lookup      | Large                | `INDIRECT`                       | Lookup        |
| `INFO`                |             | Large                | `INFO`                           |               |
| `INT`                 | Math        | Small                | `INT`                            | Maths         |
| `INTERCEPT`           | Statistical | Medium               | `INTERCEPT`                      |               |
| `INTRATE`             | Financial   | Medium               | `INTRATE`                        |               |
| `IPMT`                | Financial   | Large                | `IPMT`                           |               |
| `IRR`                 | Financial   | Small                | `IRR`                            | Finance       |
| `ISBETWEEN`           | Operator    |                      |                                  |               |
| `ISBLANK`             | Info        | Small                | `ISBLANK`                        | Information   |
| `ISDATE`              | Info        |                      |                                  |               |
| `ISEMAIL`             | Info        |                      |                                  |               |
| `ISERR`               | Info        | Small                | `ISERR`                          |               |
| `ISERROR`             | Info        | Small                | `ISERROR`                        | Information   |
| `ISEVEN`              | Math        | Medium               | `ISEVEN`                         |               |
| `ISFORMULA`           | Info        | Large                | `ISFORMULA`                      | Information   |
| `ISLOGICAL`           | Info        | Small                | `ISLOGICAL`                      | Information   |
| `ISNA`                | Info        | Small                | `ISNA`                           | Information   |
| `ISNONTEXT`           | Info        | Small                | `ISNONTEXT`                      |               |
| `ISNUMBER`            | Info        | Small                | `ISNUMBER`                       | Information   |
| `ISO.CEILING`         | Math        |                      | `COM.MICROSOFT.ISO.CEILING`      |               |
| `ISODD`               | Math        | Medium               | `ISODD`                          |               |
| `ISOWEEKNUM`          | Date        | Medium               | `ISOWEEKNUM`                     | Date and time |
| `ISPMT`               | Financial   | Large                | `ISPMT`                          |               |
| `ISREF`               | Info        | Large                | `ISREF`                          |               |
| `ISTEXT`              | Info        | Small                | `ISTEXT`                         | Information   |
| `ISURL`               | Web         |                      |                                  |               |
| `JIS`                 |             | Large                | `JIS`                            |               |
| `JOIN`                | Text        |                      |                                  | Text          |
| `KURT`                | Statistical | Medium               | `KURT`                           |               |
| `LAMBDA`              | Logical     |                      | `COM.MICROSOFT.LAMBDA`           |               |
| `LARGE`               | Statistical | Medium               | `LARGE`                          | Statistics    |
| `LCM`                 | Math        | Medium               | `LCM`                            | Maths         |
| `LEFT`                | Text        | Small                | `LEFT`                           | Text          |
| `LEFTB`               | Text        | Large                | `LEFTB`                          |               |
| `LEGACY.CHIDIST`      |             | Medium               | `LEGACY.CHIDIST`                 |               |
| `LEGACY.CHIINV`       |             | Medium               | `LEGACY.CHIINV`                  |               |
| `LEGACY.CHITEST`      |             | Medium               | `LEGACY.CHITEST`                 |               |
| `LEGACY.FDIST`        |             | Medium               | `LEGACY.FDIST`                   |               |
| `LEGACY.FINV`         |             | Medium               | `LEGACY.FINV`                    |               |
| `LEGACY.NORMSDIST`    |             | Medium               | `LEGACY.NORMSDIST`               |               |
| `LEGACY.NORMSINV`     |             | Medium               | `LEGACY.NORMSINV`                |               |
| `LEGACY.TDIST`        |             | Medium               | `LEGACY.TDIST`                   |               |
| `LEN`                 | Text        | Small                | `LEN`                            | Text          |
| `LENB`                | Text        | Large                | `LENB`                           |               |
| `LET`                 | Logical     |                      | `COM.MICROSOFT.LET`              |               |
| `LINEST`              | Array       | Medium               | `LINEST`                         |               |
| `LN`                  | Math        | Small                | `LN`                             | Maths         |
| `LOG`                 | Math        | Small                | `LOG`                            | Maths         |
| `LOG10`               | Math        | Small                | `LOG10`                          | Maths         |
| `LOGEST`              | Array       | Medium               | `LOGEST`                         |               |
| `LOGINV`              | Statistical | Medium               | `LOGINV`                         |               |
| `LOGNORM.DIST`        | Statistical |                      | `COM.MICROSOFT.LOGNORM.DIST`     |               |
| `LOGNORM.INV`         | Statistical |                      | `COM.MICROSOFT.LOGNORM.INV`      |               |
| `LOGNORMDIST`         | Statistical | Medium               | `LOGNORMDIST`                    |               |
| `LOOKUP`              | Lookup      | Medium               | `LOOKUP`                         | Lookup        |
| `LOWER`               | Text        | Small                | `LOWER`                          | Text          |
| `LT`                  | Operator    |                      |                                  |               |
| `LTE`                 | Operator    |                      |                                  |               |
| `MAKEARRAY`           | Array       |                      | `COM.MICROSOFT.MAKEARRAY`        |               |
| `MAP`                 | Array       |                      | `COM.MICROSOFT.MAP`              |               |
| `MARGINOFERROR`       | Statistical |                      |                                  |               |
| `MATCH`               | Lookup      | Small                | `MATCH`                          | Lookup        |
| `MAX`                 | Statistical | Small                | `MAX`                            | Statistics    |
| `MAXA`                | Statistical | Large                | `MAXA`                           |               |
| `MAXIFS`              | Statistical |                      | `COM.MICROSOFT.MAXIFS`           | Statistics    |
| `MDETERM`             | Array       | Large                | `MDETERM`                        |               |
| `MDURATION`           | Financial   | Medium               | `MDURATION`                      |               |
| `MEDIAN`              | Statistical | Medium               | `MEDIAN`                         | Statistics    |
| `MID`                 | Text        | Small                | `MID`                            | Text          |
| `MIDB`                | Text        | Large                | `MIDB`                           |               |
| `MIN`                 | Statistical | Small                | `MIN`                            | Statistics    |
| `MINA`                | Statistical | Large                | `MINA`                           |               |
| `MINIFS`              | Statistical |                      | `COM.MICROSOFT.MINIFS`           | Statistics    |
| `MINUS`               | Operator    |                      |                                  |               |
| `MINUTE`              | Date        | Small                | `MINUTE`                         | Date and time |
| `MINVERSE`            | Array       | Medium               | `MINVERSE`                       |               |
| `MIRR`                | Financial   | Medium               | `MIRR`                           |               |
| `MMULT`               | Array       | Medium               | `MMULT`                          |               |
| `MOD`                 | Math        | Small                | `MOD`                            | Maths         |
| `MODE`                | Statistical | Medium               | `MODE`                           | Statistics    |
| `MODE.MULT`           | Statistical |                      | `COM.MICROSOFT.MODE.MULT`        |               |
| `MODE.SNGL`           | Statistical |                      | `COM.MICROSOFT.MODE.SNGL`        |               |
| `MONTH`               | Date        | Small                | `MONTH`                          | Date and time |
| `MROUND`              | Math        | Medium               | `MROUND`                         | Maths         |
| `MULTINOMIAL`         | Math        | Medium               | `MULTINOMIAL`                    |               |
| `MULTIPLE.OPERATIONS` |             | Large                | `MULTIPLE.OPERATIONS`            |               |
| `MULTIPLY`            | Operator    |                      |                                  |               |
| `MUNIT`               | Math        | Large                | `MUNIT`                          |               |
| `N`                   | Info        | Small                | `N`                              | Information   |
| `NA`                  | Info        | Small                | `NA`                             | Information   |
| `NE`                  | Operator    |                      |                                  |               |
| `NEGBINOM.DIST`       | Statistical |                      | `COM.MICROSOFT.NEGBINOM.DIST`    |               |
| `NEGBINOMDIST`        | Statistical | Medium               | `NEGBINOMDIST`                   |               |
| `NETWORKDAYS`         | Date        | Medium               | `NETWORKDAYS`                    | Date and time |
| `NETWORKDAYS.INTL`    | Date        |                      | `COM.MICROSOFT.NETWORKDAYS.INTL` |               |
| `NOMINAL`             | Financial   | Medium               | `NOMINAL`                        |               |
| `NORM.DIST`           | Statistical |                      | `COM.MICROSOFT.NORM.DIST`        |               |
| `NORM.INV`            | Statistical |                      | `COM.MICROSOFT.NORM.INV`         |               |
| `NORM.S.DIST`         | Statistical |                      | `COM.MICROSOFT.NORM.S.DIST`      |               |
| `NORM.S.INV`          | Statistical |                      | `COM.MICROSOFT.NORM.S.INV`       |               |
| `NORMDIST`            | Statistical | Large                | `NORMDIST`                       |               |
| `NORMINV`             | Statistical | Large                | `NORMINV`                        |               |
| `NORMSDIST`           | Statistical |                      | `LEGACY.NORMSDIST`               |               |
| `NORMSINV`            | Statistical |                      | `LEGACY.NORMSINV`                |               |
| `NOT`                 | Logical     | Small                | `NOT`                            | Logic         |
| `NOW`                 | Date        | Small                | `NOW`                            | Date and time |
| `NPER`                | Financial   | Small                | `NPER`                           | Finance       |
| `NPV`                 | Financial   | Small                | `NPV`                            | Finance       |
| `NUMBERVALUE`         |             | Large                | `NUMBERVALUE`                    |               |
| `OCT2BIN`             | Engineering | Large                | `OCT2BIN`                        |               |
| `OCT2DEC`             | Engineering | Large                | `OCT2DEC`                        |               |
| `OCT2HEX`             | Engineering | Large                | `OCT2HEX`                        |               |
| `ODD`                 | Math        | Small                | `ODD`                            |               |
| `ODDFPRICE`           |             | Medium               | `ODDFPRICE`                      |               |
| `ODDFYIELD`           |             | Medium               | `ODDFYIELD`                      |               |
| `ODDLPRICE`           |             | Medium               | `ODDLPRICE`                      |               |
| `ODDLYIELD`           |             | Medium               | `ODDLYIELD`                      |               |
| `OFFSET`              | Lookup      | Medium               | `OFFSET`                         | Lookup        |
| `OR`                  | Logical     | Small                | `OR`                             | Logic         |
| `PDURATION`           | Financial   | Large                | `PDURATION`                      |               |
| `PEARSON`             | Statistical | Medium               | `PEARSON`                        |               |
| `PERCENTILE`          | Statistical | Medium               | `PERCENTILE`                     | Statistics    |
| `PERCENTILE.EXC`      | Statistical |                      | `COM.MICROSOFT.PERCENTILE.EXC`   |               |
| `PERCENTILE.INC`      | Statistical |                      | `COM.MICROSOFT.PERCENTILE.INC`   |               |
| `PERCENTRANK`         | Statistical | Medium               | `PERCENTRANK`                    |               |
| `PERCENTRANK.EXC`     | Statistical |                      | `COM.MICROSOFT.PERCENTRANK.EXC`  |               |
| `PERCENTRANK.INC`     | Statistical |                      | `COM.MICROSOFT.PERCENTRANK.INC`  |               |
| `PERMUT`              | Statistical | Medium               | `PERMUT`                         |               |
| `PERMUTATIONA`        | Statistical | Large                | `PERMUTATIONA`                   |               |
| `PHI`                 | Statistical | Large                | `PHI`                            |               |
| `PI`                  | Math        | Small                | `PI`                             | Maths         |
| `PMT`                 | Financial   | Small                | `PMT`                            | Finance       |
| `POISSON`             | Statistical | Medium               | `POISSON`                        |               |
| `POISSON.DIST`        | Statistical |                      | `COM.MICROSOFT.POISSON.DIST`     |               |
| `POW`                 | Operator    |                      |                                  |               |
| `POWER`               | Math        | Small                | `POWER`                          | Maths         |
| `PPMT`                | Financial   | Large                | `PPMT`                           |               |
| `PRICE`               | Financial   | Medium               | `PRICE`                          |               |
| `PRICEDISC`           | Financial   | Large                | `PRICEDISC`                      |               |
| `PRICEMAT`            | Financial   | Medium               | `PRICEMAT`                       |               |
| `PROB`                | Statistical | Medium               | `PROB`                           |               |
| `PRODUCT`             | Math        | Small                | `PRODUCT`                        | Maths         |
| `PROPER`              | Text        | Small                | `PROPER`                         | Text          |
| `PV`                  | Financial   | Small                | `PV`                             | Finance       |
| `QUARTILE`            | Statistical | Medium               | `QUARTILE`                       | Statistics    |
| `QUARTILE.EXC`        | Statistical |                      | `COM.MICROSOFT.QUARTILE.EXC`     |               |
| `QUARTILE.INC`        | Statistical |                      | `COM.MICROSOFT.QUARTILE.INC`     |               |
| `QUERY`               | Google      |                      |                                  |               |
| `QUOTIENT`            | Math        | Medium               | `QUOTIENT`                       | Maths         |
| `RADIANS`             | Math        | Small                | `RADIANS`                        |               |
| `RAND`                | Math        | Medium               | `RAND`                           | Maths         |
| `RANDARRAY`           | Math        |                      | `COM.MICROSOFT.RANDARRAY`        |               |
| `RANDBETWEEN`         | Math        | Medium               | `RANDBETWEEN`                    | Maths         |
| `RANK`                | Statistical | Medium               | `RANK`                           | Statistics    |
| `RANK.AVG`            | Statistical |                      | `COM.MICROSOFT.RANK.AVG`         |               |
| `RANK.EQ`             | Statistical |                      | `COM.MICROSOFT.RANK.EQ`          |               |
| `RATE`                | Financial   | Small                | `RATE`                           | Finance       |
| `RECEIVED`            | Financial   | Medium               | `RECEIVED`                       |               |
| `REDUCE`              | Array       |                      | `COM.MICROSOFT.REDUCE`           |               |
| `REGEXEXTRACT`        | Text        |                      |                                  | Text          |
| `REGEXMATCH`          | Text        |                      |                                  | Text          |
| `REGEXREPLACE`        | Text        |                      |                                  | Text          |
| `REPLACE`             | Text        | Small                | `REPLACE`                        | Text          |
| `REPLACEB`            | Text        | Large                | `REPLACEB`                       |               |
| `REPT`                | Text        | Small                | `REPT`                           | Text          |
| `RIGHT`               | Text        | Small                | `RIGHT`                          | Text          |
| `RIGHTB`              | Text        | Large                | `RIGHTB`                         |               |
| `ROMAN`               | Text        | Medium               | `ROMAN`                          |               |
| `ROUND`               | Math        | Small                | `ROUND`                          | Maths         |
| `ROUNDDOWN`           | Math        | Medium               | `ROUNDDOWN`                      | Maths         |
| `ROUNDUP`             | Math        | Medium               | `ROUNDUP`                        | Maths         |
| `ROW`                 | Lookup      | Medium               | `ROW`                            | Lookup        |
| `ROWS`                | Lookup      | Small                | `ROWS`                           | Lookup        |
| `RRI`                 | Financial   | Large                | `RRI`                            |               |
| `RSQ`                 | Statistical | Medium               | `RSQ`                            |               |
| `SCAN`                | Array       |                      | `COM.MICROSOFT.SCAN`             |               |
| `SEARCH`              | Text        | Large                | `SEARCH`                         | Text          |
| `SEARCHB`             | Text        | Large                | `SEARCHB`                        |               |
| `SEC`                 | Math        | Large                | `SEC`                            |               |
| `SECH`                | Math        | Large                | `SECH`                           |               |
| `SECOND`              | Date        | Small                | `SECOND`                         | Date and time |
| `SEQUENCE`            | Math        |                      | `COM.MICROSOFT.SEQUENCE`         | Arrays        |
| `SERIESSUM`           | Math        | Medium               | `SERIESSUM`                      |               |
| `SHEET`               | Lookup      | Large                | `SHEET`                          |               |
| `SHEETS`              | Info        | Large                | `SHEETS`                         |               |
| `SIGN`                | Math        | Medium               | `SIGN`                           | Maths         |
| `SIN`                 | Math        | Small                | `SIN`                            |               |
| `SINH`                | Math        | Medium               | `SINH`                           |               |
| `SKEW`                | Statistical | Medium               | `SKEW`                           |               |
| `SKEW.P`              | Statistical |                      |                                  |               |
| `SKEWP`               |             | Medium               | `SKEWP`                          |               |
| `SLN`                 | Financial   | Small                | `SLN`                            |               |
| `SLOPE`               | Statistical | Medium               | `SLOPE`                          |               |
| `SMALL`               | Statistical | Medium               | `SMALL`                          | Statistics    |
| `SORT`                | Filter      |                      | `COM.MICROSOFT.SORT`             | Arrays        |
| `SORTBY`              |             |                      | `COM.MICROSOFT.SORTBY`           | Arrays        |
| `SORTN`               | Filter      |                      |                                  |               |
| `SPARKLINE`           | Google      |                      |                                  |               |
| `SPLIT`               | Text        |                      |                                  | Text          |
| `SQRT`                | Math        | Small                | `SQRT`                           | Maths         |
| `SQRTPI`              | Math        | Medium               | `SQRTPI`                         |               |
| `STANDARDIZE`         | Statistical | Medium               | `STANDARDIZE`                    |               |
| `STDEV`               | Statistical | Small                | `STDEV`                          | Statistics    |
| `STDEV.P`             | Statistical |                      | `COM.MICROSOFT.STDEV.P`          | Statistics    |
| `STDEV.S`             | Statistical |                      | `COM.MICROSOFT.STDEV.S`          |               |
| `STDEVA`              | Statistical | Medium               | `STDEVA`                         |               |
| `STDEVP`              | Statistical | Small                | `STDEVP`                         |               |
| `STDEVPA`             | Statistical | Medium               | `STDEVPA`                        |               |
| `STEYX`               | Statistical | Medium               | `STEYX`                          |               |
| `SUBSTITUTE`          | Text        | Small                | `SUBSTITUTE`                     | Text          |
| `SUBTOTAL`            | Math        | Medium               | `SUBTOTAL`                       |               |
| `SUM`                 | Math        | Small                | `SUM`                            | Maths         |
| `SUMIF`               | Math        | Small                | `SUMIF`                          | Maths         |
| `SUMIFS`              | Math        | Large                | `SUMIFS`                         | Maths         |
| `SUMPRODUCT`          | Array       | Medium               | `SUMPRODUCT`                     | Maths         |
| `SUMSQ`               | Math        | Medium               | `SUMSQ`                          |               |
| `SUMX2MY2`            | Array       | Medium               | `SUMX2MY2`                       |               |
| `SUMX2PY2`            | Array       | Medium               | `SUMX2PY2`                       |               |
| `SUMXMY2`             | Array       | Medium               | `SUMXMY2`                        |               |
| `SWITCH`              | Logical     |                      | `COM.MICROSOFT.SWITCH`           | Logic         |
| `SYD`                 | Financial   | Small                | `SYD`                            |               |
| `T`                   | Text        | Small                | `T`                              |               |
| `T.DIST`              | Statistical |                      | `COM.MICROSOFT.T.DIST`           |               |
| `T.DIST.2T`           | Statistical |                      | `COM.MICROSOFT.T.DIST.2T`        |               |
| `T.DIST.RT`           | Statistical |                      | `COM.MICROSOFT.T.DIST.RT`        |               |
| `T.INV`               | Statistical |                      | `COM.MICROSOFT.T.INV`            |               |
| `T.INV.2T`            | Statistical |                      | `COM.MICROSOFT.T.INV.2T`         |               |
| `T.TEST`              | Statistical |                      | `COM.MICROSOFT.T.TEST`           |               |
| `TAN`                 | Math        | Small                | `TAN`                            |               |
| `TANH`                | Math        | Medium               | `TANH`                           |               |
| `TBILLEQ`             | Financial   | Medium               | `TBILLEQ`                        |               |
| `TBILLPRICE`          | Financial   | Medium               | `TBILLPRICE`                     |               |
| `TBILLYIELD`          | Financial   | Medium               | `TBILLYIELD`                     |               |
| `TDIST`               | Statistical |                      | `LEGACY.TDIST`                   |               |
| `TEXT`                | Text        | Large                | `TEXT`                           | Text          |
| `TEXTJOIN`            | Text        |                      | `COM.MICROSOFT.TEXTJOIN`         | Text          |
| `TIME`                | Date        | Small                | `TIME`                           | Date and time |
| `TIMEVALUE`           | Date        | Medium               | `TIMEVALUE`                      | Date and time |
| `TINV`                | Statistical | Medium               | `TINV`                           |               |
| `TOCOL`               | Array       |                      | `COM.MICROSOFT.TOCOL`            |               |
| `TODAY`               | Date        | Small                | `TODAY`                          | Date and time |
| `TOROW`               | Array       |                      | `COM.MICROSOFT.TOROW`            |               |
| `TO_DATE`             | Parser      |                      |                                  |               |
| `TO_DOLLARS`          | Parser      |                      |                                  |               |
| `TO_PERCENT`          | Parser      |                      |                                  |               |
| `TO_PURE_NUMBER`      | Parser      |                      |                                  |               |
| `TO_TEXT`             | Parser      |                      |                                  |               |
| `TRANSPOSE`           | Array       | Medium               | `TRANSPOSE`                      | Arrays        |
| `TREND`               | Array       | Medium               | `TREND`                          |               |
| `TRIM`                | Text        | Small                | `TRIM`                           | Text          |
| `TRIMMEAN`            | Statistical | Medium               | `TRIMMEAN`                       |               |
| `TRUE`                | Logical     | Small                | `TRUE`                           | Logic         |
| `TRUNC`               | Math        | Small                | `TRUNC`                          | Maths         |
| `TTEST`               | Statistical | Medium               | `TTEST`                          |               |
| `TYPE`                | Info        | Medium               | `TYPE`                           | Information   |
| `UMINUS`              | Operator    |                      |                                  |               |
| `UNARY_PERCENT`       | Operator    |                      |                                  |               |
| `UNICHAR`             | Text        | Large                | `UNICHAR`                        |               |
| `UNICODE`             | Text        | Large                | `UNICODE`                        |               |
| `UNIQUE`              | Filter      |                      | `COM.MICROSOFT.UNIQUE`           | Arrays        |
| `UPLUS`               | Operator    |                      |                                  |               |
| `UPPER`               | Text        | Small                | `UPPER`                          | Text          |
| `VALUE`               | Text        | Small                | `VALUE`                          | Text          |
| `VAR`                 | Statistical | Small                | `VAR`                            | Statistics    |
| `VAR.P`               | Statistical |                      | `COM.MICROSOFT.VAR.P`            | Statistics    |
| `VAR.S`               | Statistical |                      | `COM.MICROSOFT.VAR.S`            |               |
| `VARA`                | Statistical | Medium               | `VARA`                           |               |
| `VARP`                | Statistical | Small                | `VARP`                           |               |
| `VARPA`               | Statistical | Large                | `VARPA`                          |               |
| `VDB`                 | Financial   | Medium               | `VDB`                            |               |
| `VLOOKUP`             | Lookup      | Small                | `VLOOKUP`                        | Lookup        |
| `VSTACK`              | Array       |                      | `COM.MICROSOFT.VSTACK`           |               |
| `WEEKDAY`             | Date        | Small                | `WEEKDAY`                        | Date and time |
| `WEEKNUM`             | Date        | Medium               | `WEEKNUM`                        | Date and time |
| `WEIBULL`             | Statistical | Medium               | `WEIBULL`                        |               |
| `WEIBULL.DIST`        | Statistical |                      | `COM.MICROSOFT.WEIBULL.DIST`     |               |
| `WORKDAY`             | Date        | Medium               | `WORKDAY`                        | Date and time |
| `WORKDAY.INTL`        | Date        |                      | `COM.MICROSOFT.WORKDAY.INTL`     |               |
| `WRAPCOLS`            | Array       |                      | `COM.MICROSOFT.WRAPCOLS`         |               |
| `WRAPROWS`            | Array       |                      | `COM.MICROSOFT.WRAPROWS`         |               |
| `XIRR`                | Financial   | Medium               | `XIRR`                           |               |
| `XLOOKUP`             | Lookup      |                      | `COM.MICROSOFT.XLOOKUP`          | Lookup        |
| `XMATCH`              |             |                      | `COM.MICROSOFT.XMATCH`           | Lookup        |
| `XNPV`                | Financial   | Medium               | `XNPV`                           |               |
| `XOR`                 | Logical     | Large                | `XOR`                            | Logic         |
| `YEAR`                | Date        | Small                | `YEAR`                           | Date and time |
| `YEARFRAC`            | Date        | Medium               | `YEARFRAC`                       | Date and time |
| `YIELD`               | Financial   | Medium               | `YIELD`                          |               |
| `YIELDDISC`           | Financial   | Medium               | `YIELDDISC`                      |               |
| `YIELDMAT`            | Financial   | Medium               | `YIELDMAT`                       |               |
| `Z.TEST`              | Statistical |                      | `COM.MICROSOFT.Z.TEST`           |               |
| `ZTEST`               | Statistical | Medium               | `ZTEST`                          |               |

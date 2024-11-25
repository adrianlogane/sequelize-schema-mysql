"use strict";
const moment = require("moment");
const dataTypes = require("./data-types");
const { logger } = require("./utils/logger");
function arrayToList(array, timeZone, dialect, format2) {
  return array.reduce((sql, val, i) => {
    if (i !== 0) {
      sql += ", ";
    }
    if (Array.isArray(val)) {
      sql += `(${arrayToList(val, timeZone, dialect, format2)})`;
    } else {
      sql += escape(val, timeZone, dialect, format2);
    }
    return sql;
  }, "");
}
exports.arrayToList = arrayToList;
function escape(val, timeZone, dialect, format2) {
  let prependN = false;
  if (val === void 0 || val === null) {
    return "NULL";
  }
  switch (typeof val) {
    case "boolean":
      if (["sqlite", "mssql", "oracle"].includes(dialect)) {
        return +!!val;
      }
      return (!!val).toString();
    case "number":
    case "bigint":
      return val.toString();
    case "string":
      prependN = dialect === "mssql";
      break;
  }
  if (val instanceof Date) {
    val = dataTypes[dialect].DATE.prototype.stringify(val, { timezone: timeZone });
  }
  if (Buffer.isBuffer(val)) {
    if (dataTypes[dialect].BLOB) {
      return dataTypes[dialect].BLOB.prototype.stringify(val);
    }
    return dataTypes.BLOB.prototype.stringify(val);
  }
  if (Array.isArray(val)) {
    const partialEscape = (escVal) => escape(escVal, timeZone, dialect, format2);
    if (dialect === "postgres" && !format2) {
      return dataTypes.ARRAY.prototype.stringify(val, { escape: partialEscape });
    }
    return arrayToList(val, timeZone, dialect, format2);
  }
  if (!val.replace) {
    throw new Error(`Invalid value ${logger.inspect(val)}`);
  }
  if (["postgres", "sqlite", "mssql", "snowflake", "db2"].includes(dialect)) {
    val = val.replace(/'/g, "''");
    if (dialect === "postgres") {
      val = val.replace(/\0/g, "\\0");
    }
  } else if (dialect === "oracle" && typeof val === "string") {
    if (val.startsWith("TO_TIMESTAMP_TZ") || val.startsWith("TO_DATE")) {
      const splitVal = val.split(/\(|\)/);
      if (splitVal.length !== 3 || splitVal[2] !== "") {
        throw new Error("Invalid SQL function call.");
      }
      const functionName = splitVal[0].trim();
      const insideParens = splitVal[1].trim();
      if (functionName !== "TO_TIMESTAMP_TZ" && functionName !== "TO_DATE") {
        throw new Error("Invalid SQL function call. Expected TO_TIMESTAMP_TZ or TO_DATE.");
      }
      const params = insideParens.split(",");
      if (params.length !== 2) {
        throw new Error("Unexpected input received.\nSequelize supports TO_TIMESTAMP_TZ or TO_DATE exclusively with a combination of value and format.");
      }
      const dateValue = params[0].trim().replace(/'/g, "");
      const formatValue = params[1].trim();
      if (functionName === "TO_TIMESTAMP_TZ") {
        const expectedFormat = "'YYYY-MM-DD HH24:MI:SS.FFTZH:TZM'";
        if (formatValue !== expectedFormat) {
          throw new Error(`Invalid format string for TO_TIMESTAMP_TZ. Expected format: ${expectedFormat}`);
        }
        const formattedDate = moment(dateValue).format("YYYY-MM-DD HH:mm:ss.SSS Z");
        if (formattedDate !== dateValue) {
          throw new Error("Invalid date value for TO_TIMESTAMP_TZ. Expected format: 'YYYY-MM-DD HH:mm:ss.SSS Z'");
        }
      } else if (functionName === "TO_DATE") {
        const expectedFormat = "'YYYY/MM/DD'";
        if (formatValue !== expectedFormat) {
          throw new Error(`Invalid format string for TO_DATE. Expected format: ${expectedFormat}`);
        }
        const formattedDate = moment(dateValue).format("YYYY-MM-DD");
        if (formattedDate !== dateValue) {
          throw new Error("Invalid date value for TO_DATE. Expected format: 'YYYY-MM-DD'");
        }
      }
      return val;
    }
    val = val.replace(/'/g, "''");
  } else {
    val = val.replace(/[\0\n\r\b\t\\'"\x1a]/g, (s) => {
      switch (s) {
        case "\0":
          return "\\0";
        case "\n":
          return "\\n";
        case "\r":
          return "\\r";
        case "\b":
          return "\\b";
        case "	":
          return "\\t";
        case "":
          return "\\Z";
        default:
          return `\\${s}`;
      }
    });
  }
  return `${(prependN ? "N'" : "'") + val}'`;
}
exports.escape = escape;
function format(sql, values, timeZone, dialect) {
  values = [].concat(values);
  if (typeof sql !== "string") {
    throw new Error(`Invalid SQL string provided: ${sql}`);
  }
  return sql.replace(/\?/g, (match) => {
    if (!values.length) {
      return match;
    }
    return escape(values.shift(), timeZone, dialect, true);
  });
}
exports.format = format;
function formatNamedParameters(sql, values, timeZone, dialect) {
  return sql.replace(/:+(?!\d)(\w+)/g, (value, key) => {
    if (dialect === "postgres" && value.slice(0, 2) === "::") {
      return value;
    }
    if (values[key] !== void 0) {
      return escape(values[key], timeZone, dialect, true);
    }
    throw new Error(`Named parameter "${value}" has no value in the given object.`);
  });
}
exports.formatNamedParameters = formatNamedParameters;
//# sourceMappingURL=sql-string.js.map

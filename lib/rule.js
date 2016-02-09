"use strict";
var extd = require("./extended"),
    isArray = extd.isArray,
    Promise = extd.Promise,
    declare = extd.declare,
    isHash = extd.isHash,
    isString = extd.isString,
    format = extd.format,
    parser = require("./parser"),
    pattern = require("./pattern"),
    ObjectPattern = pattern.ObjectPattern,
    FromPattern = pattern.FromPattern,
    NotPattern = pattern.NotPattern,
    ExistsPattern = pattern.ExistsPattern,
    FromNotPattern = pattern.FromNotPattern,
    FromExistsPattern = pattern.FromExistsPattern,
    CompositePattern = pattern.CompositePattern;

var parseConstraint = function (constraint) {
    if (typeof constraint === 'function') {
        // No parsing is needed for constraint functions
        return constraint;
    }
    return parser.parseConstraint(constraint);
};

var parseExtra = extd
    .switcher()
    .isUndefinedOrNull(function () {
        return null;
    })
    .isLike(/^from +/, function (s) {
        return {from: s.replace(/^from +/, "").replace(/^\s*|\s*$/g, "")};
    })
    .def(function (o) {
        throw new Error("invalid rule constraint option " + o);
    })
    .switcher();

var normailizeConstraint = extd
    .switcher()
    .isLength(1, function (c) {
        throw new Error("invalid rule constraint " + format("%j", [c]));
    })
    .isLength(2, function (c) {
        c.push("true");
        return c;
    })
    //handle case where c[2] is a hash rather than a constraint string
    .isLength(3, function (c) {
        if (isString(c[2]) && /^from +/.test(c[2])) {
            var extra = c[2];
            c.splice(2, 0, "true");
            c[3] = null;
            c[4] = parseExtra(extra);
        } else if (isHash(c[2])) {
            c.splice(2, 0, "true");
        }
        return c;
    })
    //handle case where c[3] is a from clause rather than a hash for references
    .isLength(4, function (c) {
        if (isString(c[3])) {
            c.splice(3, 0, null);
            c[4] = parseExtra(c[4]);
        }
        return c;
    })
    .def(function (c) {
        if (c.length === 5) {
            c[4] = parseExtra(c[4]);
        }
        return c;
    })
    .switcher();

var getParamType = function getParamType(type, scope) {
    scope = scope || {};
    var getParamTypeSwitch = extd
        .switcher()
        .isEq("string", function () {
            return String;
        })
        .isEq("date", function () {
            return Date;
        })
        .isEq("array", function () {
            return Array;
        })
        .isEq("boolean", function () {
            return Boolean;
        })
        .isEq("regexp", function () {
            return RegExp;
        })
        .isEq("number", function () {
            return Number;
        })
        .isEq("object", function () {
            return Object;
        })
        .isEq("hash", function () {
            return Object;
        })
        .def(function (param) {
            throw new TypeError("invalid param type " + param);
        })
        .switcher();

    var _getParamType = extd
        .switcher()
        .isString(function (param) {
            var t = scope[param];
            if (!t) {
                return getParamTypeSwitch(param.toLowerCase());
            } else {
                return t;
            }
        })
        .isFunction(function (func) {
            return func;
        })
        .deepEqual([], function () {
            return Array;
        })
        .def(function (param) {
            throw  new Error("invalid param type " + param);
        })
        .switcher();

    return _getParamType(type);
};

var parsePattern = extd
    .switcher()
    .containsAt("or", 0, function (condition) {
        condition.shift();
        return extd(condition).map(function (cond) {
            cond.scope = condition.scope;
            return parsePattern(cond);
        }).flatten().value();
    })
    .containsAt("not", 0, function (condition) {
        condition.shift();
        condition = normailizeConstraint(condition);
        if (condition[4] && condition[4].from) {
            return [
                new FromNotPattern(
                    getParamType(condition[0], condition.scope),
                    condition[1] || "m",
                    parseConstraint(condition[2] || "true"),
                    condition[3] || {},
                    parseConstraint(condition[4].from),
                    {scope: condition.scope, pattern: condition[2]}
                )
            ];
        } else {
            return [
                new NotPattern(
                    getParamType(condition[0], condition.scope),
                    condition[1] || "m",
                    parseConstraint(condition[2] || "true"),
                    condition[3] || {},
                    {scope: condition.scope, pattern: condition[2]}
                )
            ];
        }
    })
    .containsAt("exists", 0, function (condition) {
        condition.shift();
        condition = normailizeConstraint(condition);
        if (condition[4] && condition[4].from) {
            return [
                new FromExistsPattern(
                    getParamType(condition[0], condition.scope),
                    condition[1] || "m",
                    parseConstraint(condition[2] || "true"),
                    condition[3] || {},
                    parseConstraint(condition[4].from),
                    {scope: condition.scope, pattern: condition[2]}
                )
            ];
        } else {
            return [
                new ExistsPattern(
                    getParamType(condition[0], condition.scope),
                    condition[1] || "m",
                    parseConstraint(condition[2] || "true"),
                    condition[3] || {},
                    {scope: condition.scope, pattern: condition[2]}
                )
            ];
        }
    })
    .def(function (condition) {
        if (typeof condition === 'function') {
            return [condition];
        }
        condition = normailizeConstraint(condition);
        if (condition[4] && condition[4].from) {
            return [
                new FromPattern(
                    getParamType(condition[0], condition.scope),
                    condition[1] || "m",
                    parseConstraint(condition[2] || "true"),
                    condition[3] || {},
                    parseConstraint(condition[4].from),
                    {scope: condition.scope, pattern: condition[2]}
                )
            ];
        } else {
            return [
                new ObjectPattern(
                    getParamType(condition[0], condition.scope),
                    condition[1] || "m",
                    parseConstraint(condition[2] || "true"),
                    condition[3] || {},
                    {scope: condition.scope, pattern: condition[2]}
                )
            ];
        }
    }).switcher();

var Rule = declare({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me = Object.create(prototype || Rule.prototype)
                ,patternLiteral = pojo.pattern
                ,patternClass = pattern[patternLiteral.$className];
            //
            me.name =          pojo.name;
            //
            me.agendaGroup =   pojo.agendaGroup;
            me.autoFocus =     pojo.autoFocus;
            me.priority =      pojo.priority;
            //
            me.pattern =      patternClass.fromLiteral(patternLiteral);
            me.cb =           pojo.cb;
            return me;
        }
    },
    
    instance: {
        asLiteral: function(flow) {
            var def =  {
                name:  this.name
            };
            this.agendaGroup    ?  (def.agendaGroup = this.agendaGroup) : undefined;
            this.autoFocus      ?  (def.autoFocus = this.autoFocus)   : undefined;
            def.priority = this.priority
            //
            def.pattern =       this.pattern.asLiteral(flow);
            def.cb =            this.cb;
            return def;
        },
        //
        constructor: function (name, options, pattern, cb) {
            this.name = name;
            this.pattern = pattern;
            this.cb = cb;
			this.noLoop = options.noLoop;
            if (options.agendaGroup) {
                this.agendaGroup = options.agendaGroup;
                this.autoFocus = extd.isBoolean(options.autoFocus) ? options.autoFocus : false;
            }
            this.priority = options.priority || options.salience || 0;
        },

        fire: function (flow, match) {
            var ret = new Promise(), cb = this.cb;
            try {
                if (cb.length === 3) {
                    ret = cb.call(flow, match.factHash, flow, ret.resolve);
                } else {
                    ret = cb.call(flow, match.factHash, flow);
                }
            } catch (e) {
                ret.errback(e);
            }
            return ret;
        }
    },

    toString: function() {
        return asLiteralString(this);
    }

});
exports.Rule = Rule;

function createRule(name, options, conditions, cb) {
    if (isArray(options)) {
        cb = conditions;
        conditions = options;
    } else {
        options = options || {};
    }
    var isRules = extd.every(conditions, function (cond) {
        return isArray(cond);
    });
    if (isRules && conditions.length === 1) {
        conditions = conditions[0];
        isRules = false;
    }
    var rules = [];
    var scope = options.scope || {};
    conditions.scope = scope;
    if (isRules) {
        var _mergePatterns = function (patt, i) {
            if (!patterns[i]) {
                patterns[i] = i === 0 ? [] : patterns[i - 1].slice();
                //remove dup
                if (i !== 0) {
                    patterns[i].pop();
                }
                patterns[i].push(patt);
            } else {
                extd(patterns).forEach(function (p) {
                    p.push(patt);
                });
            }

        };
        var l = conditions.length, patterns = [], condition;
        for (var i = 0; i < l; i++) {
            condition = conditions[i];
            condition.scope = scope;
            extd.forEach(parsePattern(condition), _mergePatterns);

        }
        rules = extd.map(patterns, function (patterns) {
            var compPat = null;
            for (var i = 0; i < patterns.length; i++) {
                if (compPat === null) {
                    compPat = new CompositePattern(patterns[i++], patterns[i]);
                } else {
                    compPat = new CompositePattern(compPat, patterns[i]);
                }
            }
            return new Rule(name, options, compPat, cb);
        });
    } else {
        rules = extd.map(parsePattern(conditions), function (cond) {
            return new Rule(name, options, cond, cb);
        });
    }
    return rules;
}

exports.createRule = createRule;



//
// MB
var nativeTypes = {Array: Array, String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Date: Date, Object: Object};
//
function asLiteralString(rule) {
    var wstrm   = through({encoding: 'utf-8'})
        ,count = 0
        ,flow = rule.flow
        ,pojo,obj, str;        // flow not used
	//
	pojo = rule.asLiteral()
	//
	function processItem(flow, val) {
		var type = typeof val
			,sVal, found;
		//
        switch(type) {
            case 'function':
				_.some(nativeTypes, function(fn, key) {
					found = (val === fn) ? key : undefined;
					return found;
				});
                if(!found) {
				    _.some(flow.__definedLookup, function(fn, key) {
					    found = (val === fn) ? key : undefined;
					    return found;
				    });
                }
				if( found ) {
					sVal = found;
				}
				else if( val === pattern.StateFact ) {
					sVal = 'StateFact';
				}
                else if( val in nativeTypes ) {
                    sVal = key;
                }
				else {

					sVal = val.toString();
					sVal = sVal.replace('/**/', '');
				}
            break;
                       				    
            default:  
                sVal = (undefined === val ? 'undefined' : (null === val ? 'null' : JSON.stringify(val) )); 
        }; 
		return sVal;
	}
	//
	function processArray(wstrm, theArray) {
        var sVal;
		wstrm.push('[');
        theArray.map(function(item, i, theArray) {                            
			if( _.isPlainObject(item) ) {
				mapValues(item, wstrm);
			}
			else if(_.isArray(item) ) {
				processArray(wstrm, item);
			}
			else {
				sVal = processItem(flow, item);
				wstrm.push(sVal);
			}
            (i < (theArray.length-1)) ? wstrm.push(',') : undefined;
        });
        wstrm.push(']');			
	}
    //	
    function mapValues(pojo, wstrm) {
         var count = 0
            ,ret;
            wstrm.push('{');
            ret = _.mapValues(pojo, function(val, key, obj) {
                var type, sVal, found;
				count++ ? wstrm.push(',' + key + ':') : wstrm.push(key + ':');
		        if( _.isPlainObject(val)) {
                   mapValues(val, wstrm);
			        }
                else if(_.isArray(val) ) {
						processArray(wstrm, val);
                    }
		        else {
					sVal = processItem(flow, val);
                    wstrm.push(sVal);			
		        }
	        });
         wstrm.push('}');
	    return ret;
    }
    //
    obj =  mapValues(pojo, wstrm);
    wstrm.push(null);
    str = wstrm._readableState.buffer.join('');
    str = jsBeautify(str, {indent_size: 4}); 
    return str;
}

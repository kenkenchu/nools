"use strict";

var extd = require("./extended"),
    deepEqual = extd.deepEqual,
    merge = extd.merge,
    instanceOf = extd.instanceOf,
    filter = extd.filter,
    declare = extd.declare,
    constraintMatcher;

var id = 0;
var Constraint = declare({

    type: null,
    static: {
        fromLiteral: function(pojo, prototype) {
            if (!constraintMatcher) {
                constraintMatcher = require("./constraintMatcher");     // because it's circular, the circularity was existing
            }
            //
            var me = Object.create(prototype || Constraint.prototype);
            me.$className = pojo.$className;
            //
            me.id  = id++;
            me.constraint = pojo.constraint;
            extd.bindAll(me, ["assert"]);
            me.set('alias', pojo.alias);
            //
            return me;
        }
    },

    instance: {
        asLiteral: function(flow) {
            var def =  {
                $className:      'Constraint'
                ,alias:         this.get('alias')
                ,constraint:    this.constraint
            };
            return def;
        },

        constructor: function (constraint) {
            if (!constraintMatcher) {
                constraintMatcher = require("./constraintMatcher");
            }
            this.id = id++;
            this.constraint = constraint;
            extd.bindAll(this, ["assert"]);
        },
        "assert": function () {
            throw new Error("not implemented");
        },

        getIndexableProperties: function () {
            return [];
        },

        equal: function (constraint) {
            return instanceOf(constraint, this._static) && this.get("alias") === constraint.get("alias") && extd.deepEqual(this.constraint, constraint.constraint);
        },

        getters: {
            variables: function () {
                return [this.get("alias")];
            }
        }


    }
});

var ObjectConstraint = Constraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me = this._super([pojo, prototype || ObjectConstraint.prototype]);
            return me;
        }
    },

    instance: {
        asLiteral: function(flow) {
            var def =  this._super(arguments);
            def.$className = 'ObjectConstraint';
            return def;
        },

        type: "object",

        constructor: function (type) {
            this._super([type]);
        },

        "assert": function (param) {
            return param instanceof this.constraint || param.constructor === this.constraint;
        },

        equal: function (constraint) {
            return instanceOf(constraint, this._static) && this.constraint === constraint.constraint;
        }
    }
}).as(exports, "ObjectConstraint");

var EqualityConstraint = Constraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me      = this._super([pojo, prototype || EqualityConstraint.prototype]);
            me.pattern  = pojo.pattern;
            me._matcher = pojo._matcher;
            //
            return me;
        }
    },

    instance: {
        asLiteral: function(flow) {
            var def         =  this._super(arguments);
            def.$className   = 'EqualityConstraint';
            def.pattern     = this.pattern;
            def._matcher    = this._matcher;
            return def;
        },

        type: "equality",

        constructor: function (constraint, options) {
            this._super([constraint]);
            options = options || {};
            this.pattern = options.pattern;
            this._matcher = constraintMatcher.getMatcher(constraint, options, true);
        },

        "assert": function (values) {
            return this._matcher(values);
        }
    }
}).as(exports, "EqualityConstraint");

var InequalityConstraint = EqualityConstraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me = this._super([pojo, prototype || InequalityConstraint.prototype]);
            return me;
        }
    },

    instance: {
        asLiteral: function(flow) {
            var def         =  this._super(arguments);
            def.$className   = 'InequalityConstraint';
            return def;
        },

        type: "inequality"
     }
 }).as(exports, "InequalityConstraint");

var ComparisonConstraint = EqualityConstraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me   = this._super([pojo, prototype || ComparisonConstraint.prototype]);
            return me;
        }
    },

    instance: {
        asLiteral: function(flow) {
            var def         =  this._super(arguments);
            def.$className   = 'ComparisonConstraint';
            return def;
        },

        type: "comparison"
    }
}).as(exports, "ComparisonConstraint");

var TrueConstraint = Constraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me = this._super([pojo, prototype || TrueConstraint.prototype]);
            return me;
        }
    },

    instance: {
        asLiteral: function(flow) {
            var def         =  this._super(arguments);
            def.$className   = 'TrueConstraint';
            return def;
        },

        type: "equality",

        constructor: function () {
            this._super([
                [true]
            ]);
        },

        equal: function (constraint) {
            return instanceOf(constraint, this._static) && this.get("alias") === constraint.get("alias");
        },


        "assert": function () {
            return true;
        }
    }
}).as(exports, "TrueConstraint");

var ReferenceConstraint = Constraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me = this._super([pojo, prototype || ReferenceConstraint.prototype]);
            me.cache    = {};
            me.values   = [];
            me.pattern  = pojo.pattern;
            me._options = pojo.options;
            me._matcher = pojo._matcher;
            return me;
        }
    },

    instance: {
        asLiteral: function(flow) {
            var def         = this._super(arguments);
            def.$className   = 'ReferenceConstraint';
            def.values       = this.values;
            def.pattern     = this.pattern;
            def._options    = this.options;
            def._matcher    = this._matcher;
            return def;
        },

        type: "reference",

        constructor: function (constraint, options) {
            this.cache = {};
            this._super([constraint]);
            options = options || {};
            this.values = [];
            this.pattern = options.pattern;
            this._options = options;
            this._matcher = constraintMatcher.getMatcher(constraint, options, false);
        },

        "assert": function (fact, fh) {
            try {
                return this._matcher(fact, fh);
            } catch (e) {
                throw new Error("Error with evaluating pattern " + this.pattern + " " + e.message);
            }

        },

        merge: function (that) {
            var ret = this;
            if (that instanceof ReferenceConstraint) {
                ret = new this._static([this.constraint, that.constraint, "and"], merge({}, this._options, this._options));
                ret._alias = this._alias || that._alias;
                ret.vars = this.vars.concat(that.vars);
            }
            return ret;
        },

        equal: function (constraint) {
            return instanceOf(constraint, this._static) && extd.deepEqual(this.constraint, constraint.constraint);
        },


        getters: {
            variables: function () {
                return this.vars;
            },

            alias: function () {
                return this._alias;
            }
        },

        setters: {
            alias: function (alias) {
                this._alias = alias;
                this.vars = filter(constraintMatcher.getIdentifiers(this.constraint), function (v) {
                    return v !== alias;
                });
            }
        }
    }

}).as(exports, "ReferenceConstraint");


ReferenceConstraint.extend({
    instance: {
        type: "reference_equality",
        op: "eq",
        getIndexableProperties: function () {
            return constraintMatcher.getIndexableProperties(this.constraint);
        }
    }
}).as(exports, "ReferenceEqualityConstraint")
var ReferenceEqualityConstraint =    ReferenceConstraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me = this._super([pojo, prototype || ReferenceEqualityConstraint.prototype]);
            return me;
        }
    },
    instance: {
        asLiteral: function(flow) {
            var def         = this._super(arguments);
            def.$className  = 'ReferenceEqualityConstraint';
            return def;
        },
        //
        type: "reference_equality",
        op: "eq",
        getIndexableProperties: function () {
            return constraintMatcher.getIndexableProperties(this.constraint);
        }
    }
}).as(exports, "ReferenceEqualityConstraint");

var ReferenceInequalityConstraint = ReferenceEqualityConstraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me = this._super([pojo, prototype || ReferenceInequalityConstraint.prototype]);
            return me;
        }
    },
    
    instance: {
        asLiteral: function(flow) {
            var def         = this._super(arguments);
            def.$className   = 'ReferenceInequalityConstraint';
            return def;
        },

        type: "reference_inequality", op: "neq"
     }
}).as(exports, "ReferenceInequalityConstraint");

var ReferenceGTConstraint = ReferenceEqualityConstraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me = this._super([pojo, prototype || ReferenceGTConstraint.prototype]);
            return me;
        }
    },
    
    instance: {
        asLiteral: function(flow) {
            var def         = this._super(arguments);
            def.$className   = 'ReferenceGTConstraint';
            return def;
        },

        type: "reference_gt", op: "gt"
    }
}).as(exports, "ReferenceGTConstraint");

var ReferenceGTEConstraint = ReferenceEqualityConstraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me = this._super([pojo, prototype || ReferenceGTEConstraint.prototype]);
            return me;
        }
    },
    
    instance: {
        asLiteral: function() {
            var def         = this._super(arguments);
            def.$className   = 'ReferenceGTEConstraint';
            return def;
        },

        type: "reference_gte", op: "gte"
     }
}).as(exports, "ReferenceGTEConstraint");

var ReferenceLTConstraint = ReferenceEqualityConstraint.extend({
     static: {
        fromLiteral: function(pojo, prototype) {
            var me = this._super([pojo, prototype || ReferenceLTConstraint.prototype]);
            return me;
        }
    },
   
    instance: {
        asLiteral: function(flow) {
            var def         = this._super(arguments);
            def.$className   = 'ReferenceLTConstraint';
            return def;
        },

        type: "reference_lt", op: "lt"
     }
}).as(exports, "ReferenceLTConstraint");

var ReferenceLTEConstraint = ReferenceEqualityConstraint.extend({
     static: {
        fromLiteral: function(pojo, prototype) {
            var me = this._super([pojo, prototype || ReferenceLTEConstraint.prototype]);
            return me;
        }
    },
    
    instance: {
        asLiteral: function(flow) {
            var def         = this._super(arguments);
            def.$className   = 'ReferenceLTEConstraint';
            return def;
        },

        type: "reference_lte", op: "lte"
     }
}).as(exports, "ReferenceLTEConstraint");

var HashConstraint = Constraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me = this._super([pojo, prototype || HashConstraint.prototype]);
            return me;
        }
    },
    
    instance: {
        asLiteral: function(flow) {
            var def         = this._super(arguments);
            def.$className   = 'HashConstraint';
            return def;
        },

        type: "hash",

        constructor: function (hash) {
            this._super([hash]);
        },

        equal: function (constraint) {
            return extd.instanceOf(constraint, this._static) && this.get("alias") === constraint.get("alias") && extd.deepEqual(this.constraint, constraint.constraint);
        },

        "assert": function () {
            return true;
        },

        getters: {
            variables: function () {
                return this.constraint;
            }
        }

    }
}).as(exports, "HashConstraint");

var FromConstraint = Constraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me          = this._super([pojo, prototype || FromConstraint.prototype]);
            me.type         = pojo.type;
            me.constraints = pojo.constraints;
            return me;
        }
    },

    instance: {
        asLiteral: function(flow) {
            var def         = this._super(arguments);
            def.$className   = 'FromConstraint';
            def.type        = "from";
            def.constraints = this.constraints;
            return def;
        },

        constructor: function (constraints, options) {
            this.type = "from";
            this.constraints = constraintMatcher.getSourceMatcher(constraints, (options || {}), true);
            extd.bindAll(this, ["assert"]);
        },

        equal: function (constraint) {
            return instanceOf(constraint, this._static) && this.get("alias") === constraint.get("alias") && deepEqual(this.constraints, constraint.constraints);
        },

        "assert": function (fact, fh, session) {
            return this.constraints.call(session, fact, fh);
        },

        getters: {
            variables: function () {
                return this.constraint;
            }
        }

    }
});
exports.FromConstraint = FromConstraint;


Constraint.extend({
    static: {
        fromLiteral: function(pojo, prototype) {
            var me      = this._super([pojo, prototype || CustomConstraint.prototype]);
            me.type     = pojo.type;
            me.fn       = pojo.fn;
            me.options  = pojo.options;
            return me;
        }
    },

    instance: {
        asLiteral: function(flow) {
            var def         = this._super(arguments);
            def.$className   = 'CustomConstraint';
            def.type        = 'custom';
            def.fn          = this.fn;
            def.options     = this.options;
            return def;
        },

        constructor: function (func, options) {
            this.type = "custom";
            this.fn = func;
            this.options = options;
            extd.bindAll(this, ["assert"]);
        },

        equal: function (constraint) {
            return instanceOf(constraint, this._static) && this.fn === constraint.constraint;
        },

        "assert": function (fact, fh) {
            return this.fn(fact, fh);
        }
    }
}).as(exports, "CustomConstraint");



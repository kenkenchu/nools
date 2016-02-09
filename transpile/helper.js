var parser      = require('nools/lib/parser/nools/nool.parser.js');
var RuleClass   = require('nools/lib/rule.js').Rule;
var transpile   = require('nools/lib/compile/transpile');
var extd        = require("../lib/extended");
var beautify    = require('js-beautify').js_beautify;
var when        = require('when');

//
function Rule(nools) {
    var me = this, ruleObj;
    if( extd.isString(nools)) {
        me.dsl = nools;
    }
    else if(extd.isHash(nools)) {
        me._init(nools);
    }
}
//
module.exports     = Rule;

Rule.prototype = {
    name:           undefined
    ,dsl:           undefined
    ,options:       undefined
    ,constraints:   undefined
    ,actionText:    undefined
    ,fnAction:      undefined
    ,noolsRule:     undefined
    //
    ,_init: function(ruleObj) {
        var me = this;
            //
            me.name         = ruleObj.name;
            me.dsl          = ruleObj.src;
            me.options      = ruleObj.options;
            me.constraints  = ruleObj.constraints;
            me.actionText   = ruleObj.action;
            me.fnAction     = ruleObj.fnAction;
            me.options.scope = me.options.scope || {};	
            me.isQuery      = me.options.agendaGroup ? (me.options.agendaGroup.indexOf('Query') == 0 ? true : false) : false;
        }
    //
    ,parse: function () {
        var me = this, flowObj, ruleObj;
        try {
            flowObj = parser.parse(me.dsl);
            ruleObj = flowObj.rules[0];
            me._init(ruleObj);
        }  
        catch (e) {
                me.err = new Error(e);
                console.error('Rule.parse: ' + e);
            }
    }
    //
    ,transpile: function(defines, scope) {
        var me = this
            , identifiers = []
            , constraints
            , actionJs;
        try {
            constraints = me.constraints.map(function (c) {
                return transpile.constraintsToJs(c, identifiers);
            }); 
            //if( me.isQuery ) {
            //    scope = scope || {};
            //    scope.params = {};    
            //}
            actionJs = transpile.actionToJs(me.actionText, identifiers, defines, scope);
            fnText    = beautify(actionJs);
        }
         catch (e) {
            console.error('Rule.createActionFn: ' + e);
        }
        return fnText;
    }
    //
    ,createActionFn: function (defines, scope) {
        var me = this
            , identifiers = []
            , constraints
            , actionJs;
        try {
            constraints = me.constraints.map(function (c) {
                return transpile.constraintsToJs(c, identifiers);
            }); 
            actionJs = transpile.actionToJs(me.actionText, identifiers, defines, scope);
            fnText    = beautify(actionJs);
            me.actionText = fnText;
            actionFn = new Function('var defined = arguments[0], scope = arguments[1]; return ' + fnText);
            actionFn = actionFn(defines, scope);
        }
         catch (e) {
            console.error('Rule.createActionFn: ' + me.name + ', ' + e);
        }
        return actionFn;
    }
}

var stream      = require('stream');

var extd        = require("../lib/extended");
var when        = require('when');
var through     = require('through2');
var path        = require('path');
var jsBeautify  = require('js-beautify').js_beautify;

// nools
var parser      = require('../lib/parser/nools/nool.parser.js');
var transpile   = require('../lib/compile/transpile.js');
var rule        = require('../lib/rule.js');

// transpile
var Rule        = require('./helper.js');

//
var header = 
`
var extd  = require('extended');
var rules  = {};
var source = {};
var defined = {};		// OK to override this with a require or a more explicit initializer in options passed to transpiler...
`;
//
// Below is the javascript for a flow callback which adds the defines and the rules that are declared
// in this module.  This is the standard callback; e.g. var myFlow = nools.flow(callback);
//                
var footer = 
`
	/*
		Handle RegExp serialization ( fix JSON parser )
	*/
	function mapValues(obj) {
        var ret = {};

		//var ret = _.mapValues(obj, function(value, key, obj) {
        extd(obj).forEach(function(value, key) {
			if( extd.isHash(value)) {
					return mapValues(value);
				}
			else {
				if (value.toString().indexOf("__REGEXP ") == 0) {
					var m = value.split("__REGEXP ")[1].match(/\\/(.*)\\/(.*)?/);
					//return new RegExp(m[1], m[2] || "");
                    obj[key] = new RegExp(m[1], m[2] || "");
				} else {
					//return value;
                    obj[key] = value;
				}
			}
		});
		return ret;
	}
	/*
		Flow Callback
	*/
    module.exports = function(flow) {
    // the javascript defines ...
	if( defined ) {
		extd(defined).forEach(function(val, key) {
				flow.addDefined(key, val);
			});
	}
    // the nools defines; e.g. useage of the dsl keyword define(...) ...
    processNoolsDefines.call(flow);   
	//
	// this step puts the defines in scope; so they can be referenced by name from RHS code
	// without having to do something like defined.<name>(...)
	var tmpl  = [undefined, ' = defined.', undefined, ';'];
	var init = [];
    extd(defined).forEach(function(val, key, coll) {
        flow.addDefined(key, val);
		tmpl[0] = key; tmpl[2] = key;
		init.push(tmpl.join(''));
    });
	var s = init.join('\\n');
	eval(s);
	//	
	// assign all defined types to the rules scope
    extd(rules).forEach(function(transpiledRule, key, obj) {
		 if(!transpiledRule.options) {
				 transpiledRule.options = { scope: {} };
			}	
		else if( !transpiledRule.options.scope ) {
				transpiledRule.options.scope = {};
			}
		 transpiledRule.options.scope = mapValues(transpiledRule.options.scope);
       // _.assign(transpiledRule.options.scope, defined);
        extd(defined).forEach(function(val, key) {
            transpiledRule.options.scope[key] = val;
            });
    }); 

    // add the rules...
    extd(rules).forEach(function(rule, key, obj) {
        flow.createRule(rule.name, rule.options, rule.constraints, rule.fnAction, ruleSrc[rule.name]);
    });        
};      
`;

/**
	options - include either a path for external defines OR an object literal
	options.defined = 'rulesABC/defines.js' || { field: function Field() {} }
*/
function generateHeader(optionsMap) {
    var options = [];
    if( optionsMap ) {
        extd(optionsMap).forEach(function(val, key) {
            var s;
			switch(key) {
				case 'require':
					if( extd.isHash(val)) {
						extd(val).forEach(function(path, varName) {
							 
							 path ? options.push(requireText(varName, path)) : undefined;
    						});
				   }
				else {
					console.error('generateHeader:  invalid type: ' + typeof val);
					}
				break;				
			};
         });
		if( options.length ) {
			return ([header, options.join('\n')].join('') + '\n\n');
		}
		else {
			 return header;  
			}
    }
    else {
        return header;  
    }
}
//
function requireText(varName, path) {
    var requireDecl = ['var ', undefined, '\t\t= ', 'require( "', undefined, '");']
    requireDecl[1] = varName; 
    requireDecl[4] = path;     
    return requireDecl.join('');
}
//
function stringIfyRuleOptions(obj) {
    return JSON.stringify(obj, function(key,val) {
		var s, flag;
		if( val instanceof RegExp) {
			val = ("__REGEXP " + val.toString());
			}
		return val;
	}, 2);
}
//
function ruleText(rule, fnText, scope) {
    var me = this
        ,tmplA = [',fnAction: ', undefined, '};']
        ,keys, scope, options, obj, str;
    // check to see if there are in fact rule options , to avoid empty object literal(s) in output
    keys = extd(rule.options).keys();
    if( keys.length > 1 ) {
        options = rule.options;
        }
    else {
       if( 'scope' === keys[0] ) {
            keys = extd(rule.options.scope).keys();
            if(keys.length > 0 ) {
                 options = rule.options;
                }
           }
       else {
         options = rule.options;
           }  
    }
    obj = {
        name:             rule.name
        ,constraints:     rule.constraints
    };
    if( options ) {
        scope = options.scope;
        keys = extd(scope).keys();
        if(!keys.length) {
            delete options.scope;
            }
        obj = {
            name:             rule.name
            ,options:         options
            ,constraints:     rule.constraints
        };
      }
    else {
        obj = {
            name:             rule.name
            ,constraints:     rule.constraints
        };
   }
    //
    str         = stringIfyRuleOptions(obj); 
    str         = str.substr(0, str.length-1);
    tmplA[1]    = fnText; 
    str         += tmplA.join('');
    return str;
}
var definesExplain = `
/*
	DSL - defines => transpile.transpileDefines(flowObj)
*/
`;
//
function definesText(transpiled) {
    var a =[definesExplain, 'function processNoolsDefines() {', transpiled, '}\n\n'];
    return a.join('');
}
//
function exportsText(rule, fnText) {
    var me = this
		,tmplA  = [undefined, 'rules.',undefined,' = ', undefined, '\n'] 
        ,tmplB = ['/*\n', undefined, '\n*/\n']
        ,str;
	tmplB[1] = jsBeautify(rule.dsl, {indent_size: 4})
	tmplA[0] = tmplB.join('');
    tmplA[2] = rule.name;
    tmplA[4] = fnText;
    return tmplA.join('');
}
//
function phaseTwo(str, options) {
     var ruleSrc = {}
		,defineDecls = []
		,defineTmpl = ['var ',undefined, ';']
		,flowObj, wstrm, ruleInstance, fnText, outText, strmText, headerText;
    try { 
        flowObj = parser.parse(str);            // nools flow object, NOT a flow instance, the obj def of a flow
        //
        wstrm   = through({encoding: 'utf-8'});
        //
		// note: options.require for scope and defined: { require: {defined: 'myProject/defines.js', scope: 'myProject/scope.js} }
		//		 this generates the apropriate require statements in the transpiled output and they are introduced into the flow
		//		 automatically in the flow callback
        header = generateHeader(options);
        wstrm.push(header, 'utf-8');     
        //
        flowObj.rules.map(function(rule) {
			ruleSrc[rule.name] =jsBeautify(rule.src, {indent_size: 4});
            ruleInstance = new Rule(rule);
			//
			// there are a couple levels of type checking, one is below, where types that are referenced
			// in constraints are checked against, defined/scope maps
			// this allows the rule to be transpiled, it's arguable whether or not this should be checked at all at this
			// stage - perhaps we disable that at transpile time, and let it fail later when the flow is built
			//
			// The important part is that types are present in the flow at runtime. (via flow.addDefined(...) )
			// note: it's likely that require('myDefines')/ require('myScope') will be the preferred way of 
			// importing types into a flow, the confusing thing is due to his type checking of constraints at transpile time
			// (which we should remove) we need them before AND after so we generate script - require(...) and we have it 'live' here
            fnText       = ruleInstance.transpile(options.defined, options.scope);
            outText      = ruleText(ruleInstance, fnText, options.scope);
            outText      = exportsText(ruleInstance, outText);
            wstrm.push(outText, 'utf-8');  	
        });
        //
        outText = transpile.transpileDefines(flowObj);
        outText = definesText(outText);
        wstrm.push(jsBeautify(outText, {indent_size: 4}), 'utf-8'); 
        wstrm.push('\n\n');
		//
		flowObj.define.map(function(obj) {
			defineTmpl[1] = obj.name;
			defineDecls.push(defineTmpl.join(''));
			});
		//
		extd(options.defined).forEach(function(val, key) {
			defineTmpl[1] = key;
			defineDecls.push(defineTmpl.join(''));
			});
		//
		extd(options.scope).forEach(function(val, key) {
			defineTmpl[1] = key;
			defineDecls.push(defineTmpl.join(''));
			});

		wstrm.push('\n\n');
		//
		wstrm.push(defineDecls.join('\n'));
		wstrm.push('\n\n');
		//
		outText = JSON.stringify(ruleSrc);
        wstrm.push('var ruleSrc = ' + outText);
		//
        wstrm.push(footer, 'utf-8');   
        wstrm.push(null);
    }
    catch(e) {
        console.error(e.message);
        console.error(e.stack);
    }
	return  wstrm;
}


//
module.exports = function (str, options) {       
    var inputStrm, writeStrm;
	return when.promise(function(resolve, reject) {
		if( 0 === arguments.length ) {
			inputStrm = process.stdin;
		}
		else if( extd.isHash(str) ) {
			inputStrm = process.stdin;						// should probably do this in: bin/transpile cmd wrapper (like stdout)
			options = str;
		 }
		else if( str instanceof stream.Readable) {
			inputStrm = str;
			}
		//
		options = options || {};
		if( options.defines) {
			options.defined = options.defines;              // the word 'defined' is used by Nools in the generated output, otherwise Nools uses 'define(s)' , fix common error
			delete options.defines;    
		}
		options.defined = options.defined || {};
		options.scope   = options.scope   || {};
		//
		if( inputStrm )  {
			var buffers = [];
			inputStrm.on('readable', function () {
				var buf = inputStrm.read()
					,src;
				//
				if( buf) {
					buffers.push(buf.toString());
				}
				else  {
					 src = buffers.join('');
					 writeStrm = phaseTwo(src, options);
					 resolve(writeStrm);
				}
			});
		}
		else {
			writeStrm = phaseTwo(str, options);   
			resolve(writeStrm); 
		}
	});
};

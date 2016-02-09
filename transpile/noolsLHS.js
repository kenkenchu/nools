var stream      = require('stream');

var extd        = require("../lib/extended");
var when        = require('when');
var through     = require('through2');
var path        = require('path');
var jsBeautify  = require('js-beautify').js_beautify;

// nools
var nools		= require('../');
var parser      = require('../lib/parser/nools/nool.parser.js');
var transpile   = require('../lib/compile/transpile.js');
var Rule        = require('../lib/rule.js').Rule;
var pattern     = require('../lib/pattern.js');

//
var header = 
`
var Rule		= nools.Rule;
var rules  = {};
var source = {};
var defined = {};		// OK to override this with a require or a more explicit initializer in options passed to transpiler...
`;
//
// Below is the javascript for a flow callback which adds the defines and the rules that are declared
// in this module.  This is the standard callback; e.g. var myFlow = nools.flow(callback);
//                
var footerDSL = 
`
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
        for (var key in defined) {
          if( defined.hasOwnProperty( key ) ) {
            flow.addDefined(key, defined[key]);
			tmpl[0] = key; tmpl[2] = key;
			init.push(tmpl.join(''));           
          } 
        }
		var s = init.join('\\n');
		eval(s);
		//
        for (var key in rules) {
			var objLiteral = rules[key]()
				,instance =  Rule.fromLiteral(objLiteral);
			flow.addRule(instance);
		});        
	};      
`;
var footerJavascript = 
`
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
		//
		// this step puts the defines in scope; so they can be referenced by name from RHS code
		// without having to do something like defined.<name>(...)
		var tmpl  = [undefined, ' = defined.', undefined, ';'];
		var init = [], objLiteral, instance;
        for (var key in flow.__defined) {
            if( flow.__defined.hasOwnProperty( key ) ) {
			    tmpl[0] = key; tmpl[2] = key;
			    init.push(tmpl.join(''));
            }
		}
		var s = init.join('\\n');
		eval(s);
		//
        for (var key in rules) {    
            if( rules.hasOwnProperty( key ) ) {
			    objLiteral = rules[key]();
		        instance   =  Rule.fromLiteral(objLiteral);
			    flow.addRule(instance);
            }
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
				
				case 'defines':
 
   				break;			
			};
         });
		if( options.length ) {
			return ([requireText('nools', optionsMap.nools), header, options.join('\n')].join('') + '\n\n');
		}
		else {
			 return ([requireText('nools', optionsMap.nools), header].join('') + '\n\n');
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
    requireDecl[4] = path.replace(/\\/g, '/');     
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
//
function asLiteralString(flow, pojo) {
    var wstrm   = through({encoding: 'utf-8'})
        ,count = 0
        ,obj, str;
	//
	function processItem(flow, val) {
		var type = typeof val
			,sVal, found, keys;
		//
        switch(type) {
            case 'function':
                if( extd.isHash(flow.__definedLookup) ) {
                    keys = extd(flow.__definedLookup).keys();
                    found = keys.some(function(fn) {
                        return val === fn;
                    });
                    extd(flow.__definedLookup).forEach(function(fn, key) {
                        if( val === fn ) {
                            found = true;
                        }

                    });
                }
				if( found ) {
					sVal = found;
				}
				else if( val === pattern.StateFact ) {
					sVal = 'StateFact';
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
		wstrm.push('[');
        theArray.map(function(item, i, theArray) {                            
			if( extd.isHash(item) ) {
				mapValues(item, wstrm);
			}
			else if(extd.isArray(item) ) {
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
           extd(pojo).forEach(function(val, key, obj) {
                var type, sVal, found;
				count++ ? wstrm.push(',' + key + ':') : wstrm.push(key + ':');
		        if( extd.isHash(val)) {
                   mapValues(val, wstrm);
			        }
                else if(extd.isArray(val) ) {
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
    mapValues(pojo, wstrm);
    wstrm.push(null);
    str = wstrm._readableState.buffer.join('');
    str = jsBeautify(str, {indent_size: 4}); 
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
		,tmplA  = [undefined, 'rules.',undefined,' = function() {\n return ', undefined, ';\n};\n'] 
        ,tmplB = ['/*\n', undefined, '\n*/\n']
        ,str;
	tmplB[1] = rule.src ? jsBeautify(rule.src, {indent_size: 4}) : ' javascript object literal '
	tmplA[0] = tmplB.join('');
    tmplA[2] = rule.name;
    tmplA[4] = fnText;
    return tmplA.join('');
}
//
function processDSL(str, options) {
     var ruleSrc = {}
		,defineDecls = []
		,defineTmpl = ['var ',undefined, ';']
		,flowObj, flowInstance, wstrm, ruleInstance, outText, header;
        //
		flowInstance = nools.compile(str, {
			name: 'temp'
			,define: options.defined
			,scope:  options.scope
		}
		,function(flow) {
			//
			wstrm   = through({encoding: 'utf-8'});
			//
			// note: options.require for scope and defined: { require: {defined: 'myProject/defines.js', scope: 'myProject/scope.js} }
			//		 this generates the apropriate require statements in the transpiled output and they are introduced into the flow
			//		 automatically in the flow callback
			header = generateHeader(options);
			wstrm.push(header, 'utf-8'); 
			flow.__rules.map(function(rule) {
				var pojo;
				ruleSrc[rule.name]	= rule.src;
				pojo				= rule.asLiteral(flow);
				outText				= asLiteralString(flow, pojo);
				outText				= exportsText(rule, outText);
				wstrm.push(outText, 'utf-8'); 
			});
			//
			outText = transpile.transpileDefines(flow.flowObj);
			outText = definesText(outText);
			wstrm.push(jsBeautify(outText, {indent_size: 4}), 'utf-8'); 
			wstrm.push('\n\n');
			//
			outText = JSON.stringify(ruleSrc);
			wstrm.push('var ruleSrc = ' + outText);
			//
			wstrm.push(footerDSL, 'utf-8');   
			wstrm.push(null);
		});
	return  wstrm;
}
//
exports.fromJavascript = function(callback, options) {
	var ruleSrc			= {}
		,defineDecls	= []
		,defineTmpl		= ['var ', undefined, ';'];
	//	
	return when.promise(function(resolve, reject) {
		var flow, wstrm, ruleInstance, outText, header;
		//
		flow = nools.flow('temp', callback);
		try { 
			//
			wstrm   = through({encoding: 'utf-8'});
			//
			// note: options.require for scope and defined: { require: {defined: 'myProject/defines.js', scope: 'myProject/scope.js} }
			//		 this generates the apropriate require statements in the transpiled output and they are introduced into the flow
			//		 automatically in the flow callback
			header = generateHeader(options);
			wstrm.push(header, 'utf-8'); 
			flow.__rules.map(function(rule) {
				var pojo;
				ruleSrc[rule.name]	= rule.src;
				pojo				= rule.asLiteral(flow);
				outText				= asLiteralString(flow, pojo);
				outText				= exportsText(rule, outText);
				wstrm.push(outText, 'utf-8'); 
			});
// there is no flowObj just a flow instance in this case, however we can probably do the same thing
//outText = transpile.transpileDefines(flow.flowObj);
//outText = definesText(outText);
//wstrm.push(jsBeautify(outText, {indent_size: 4}), 'utf-8'); 
//wstrm.push('\n\n');
////
//outText = JSON.stringify(ruleSrc);
//wstrm.push('var ruleSrc = ' + outText);
			//
			wstrm.push(footerJavascript, 'utf-8');   
			wstrm.push(null);
			resolve(wstrm);
		}
		catch(e) {
			reject(e);
		}
	});
}
//
exports.transpile = function (str, options) {      
    var inputStrm, writeStrm;
	return when.promise(function(resolve, reject) {
		try { 
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
			else if( options.define) {
				options.defined = options.define;              // the word 'defined' is used by Nools in the generated output, otherwise Nools uses 'define(s)' , fix common error
				delete options.define;    
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
						 writeStrm = processDSL(src, options);
						 resolve(writeStrm);
					}
				});
			}
			else {
				writeStrm = processDSL(str, options);   
				resolve(writeStrm); 
			}
		}
		catch(e) {
			reject(e);	
		}
	});
};

import {rollCommand} from './engine.mjs'
try{console.log(rollCommand(process.argv.slice(2).join(' ')).text)}catch(e){console.error(e.message);process.exitCode=1}

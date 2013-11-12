const Gio = imports.gi.Gio;
const ExtensionUtils = imports.misc.extensionUtils;
const Clutter = imports.gi.Clutter;

const ICONS = {
    preferences: 'preferences-system-symbolic',
    toggle: 'emblem-synchronizing-symbolic',
    clear: 'edit-clear-all-symbolic',
    delete: 'edit-delete-symbolic',
    indicator: 'edit-paste-symbolic'
};

const SPINNER_ICON = global.datadir + '/theme/process-working.svg';
const SPINNER_ICON_SIZE = 24;

function launch_extension_prefs(uuid) {
    const Shell = imports.gi.Shell;
    let appSys = Shell.AppSystem.get_default();
    let app = appSys.lookup_app('gnome-shell-extension-prefs.desktop');
    app.launch(global.display.get_current_time_roundtrip(),
               ['extension:///' + uuid], -1, null);
}

function is_blank(str) {
    return (!str || /^\s*$/.test(str));
}

function starts_with(str1, str2) {
    return str1.slice(0, str2.length) == str2;
}

function ends_with(str1, str2) {
  return str1.slice(-str2.length) == str2;
}

function escape_html(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function wordwrap(str, width, brk, cut) {
    brk = brk || '\n';
    width = width || 75;
    cut = cut || false;

    if (!str) { return str; }

    let regex =
        '.{1,' + width + '}(\\s|$)' + (cut ? '|.{' + width +
        '}|.+$' : '|\\S+?(\\s|$)');

    return str.match( RegExp(regex, 'g') ).join( brk );
}

function get_unichar(keyval) {
    let ch = Clutter.keysym_to_unicode(keyval);

    if(ch) {
        return String.fromCharCode(ch);
    }
    else {
        return false;
    }
}

function array_search(term, arr) {
    let temp = [];

    for(let i = 0; i < arr.length; i++) {
        term = term.toLowerCase();
        let str = arr[i].toLowerCase();
        let r = str.search(term);
        if(r === -1) continue;
        temp.push([r, arr[i]]);
    }

    temp.sort(function(a, b) {return a[0] > b[0]});

    let result = [];

    for(let i = 0; i < temp.length; i++) {
        result.push(temp[i][1]);
    }

    return result;
}

/**
 * getSettings:
 * @schema: (optional): the GSettings schema id
 *
 * Builds and return a GSettings schema for @schema, using schema files
 * in extensionsdir/schemas. If @schema is not provided, it is taken from
 * metadata['settings-schema'].
 */
function getSettings(schema) {
    let extension = ExtensionUtils.getCurrentExtension();

    schema = schema || extension.metadata['settings-schema'];

    const GioSSS = Gio.SettingsSchemaSource;

    // check if this extension was built with "make zip-file", and thus
    // has the schema files in a subfolder
    // otherwise assume that extension has been installed in the
    // same prefix as gnome-shell (and therefore schemas are available
    // in the standard folders)
    let schemaDir = extension.dir.get_child('schemas');
    let schemaSource;

    if(schemaDir.query_exists(null)) {
        schemaSource = GioSSS.new_from_directory(
            schemaDir.get_path(),
            GioSSS.get_default(),
            false
        );
    }
    else {
        schemaSource = GioSSS.get_default();
    }

    let schemaObj = schemaSource.lookup(schema, true);

    if(!schemaObj)
        throw new Error(
            'Schema '+schema+' could not be found for extension '
            +extension.metadata.uuid+'. Please check your installation.'
        );

    return new Gio.Settings({ settings_schema: schemaObj });
}

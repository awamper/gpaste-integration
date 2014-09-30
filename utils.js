const Gio = imports.gi.Gio;
const ExtensionUtils = imports.misc.extensionUtils;
const Clutter = imports.gi.Clutter;

const ICONS = {
    preferences: 'preferences-system-symbolic',
    toggle: 'emblem-synchronizing-symbolic',
    clear: 'edit-clear-all-symbolic',
    delete: 'edit-delete-symbolic',
    indicator: 'edit-paste-symbolic',
    switch_history: 'view-list-symbolic'
};

const SPINNER_ICON = global.datadir + '/theme/process-working.svg';
const SPINNER_ICON_SIZE = 24;

const SETTINGS = getSettings();

function launch_extension_prefs(uuid) {
    const Shell = imports.gi.Shell;
    let appSys = Shell.AppSystem.get_default();
    let app = appSys.lookup_app('gnome-shell-extension-prefs.desktop');
    let info = app.get_app_info();
    let timestamp = global.display.get_current_time_roundtrip();
    info.launch_uris(
        ['extension:///' + uuid],
        global.create_app_launch_context(timestamp, -1)
    );
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

function get_unichar(keyval) {
    let ch = Clutter.keysym_to_unicode(keyval);

    if(ch) {
        return String.fromCharCode(ch);
    }
    else {
        return false;
    }
}

function is_pointer_inside_actor(actor, x, y) {
    let result = false;
    let [actor_x, actor_y] = actor.get_transformed_position();
    let [pointer_x, pointer_y] = global.get_pointer();

    if(x) pointer_x = x;
    if(y) pointer_y = y;

    if(
        pointer_x >= actor_x
        && pointer_x <= (actor_x + actor.width)
        && pointer_y >= actor_y
        && pointer_y <= (actor_y + actor.height)
    ) {
        result = true;
    }

    return result;
}

// 32 bit FNV-1a hash
// Found here: https://gist.github.com/vaiorabbit/5657561
// Ref.: http://isthe.com/chongo/tech/comp/fnv/
function fnv32a(str) {
    let FNV1_32A_INIT = 0x811c9dc5;
    let hval = FNV1_32A_INIT;

    for(let i = 0; i < str.length; ++i) {
        hval ^= str.charCodeAt(i);
        hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }

    return hval >>> 0;
}

function get_url(text) {
    let url_regexp = imports.misc.util._urlRegexp;
    let url = parseUri(text);
    let test_url = '';

    if(is_blank(url.protocol)) {
        test_url = 'http://' + url.source;
    }
    else {
        test_url = url.source;
    }

    if(!test_url.match(url_regexp)) {
        return false;
    }
    else {
        return test_url;
    }
}

// parseUri 1.2.2
// (c) Steven Levithan <stevenlevithan.com>
// MIT License

function parseUri (str) {
  var o   = parseUri.options,
    m   = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
    uri = {},
    i   = 14;

  while (i--) uri[o.key[i]] = m[i] || "";

  uri[o.q.name] = {};
  uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
    if ($1) uri[o.q.name][$1] = $2;
  });

  return uri;
};

parseUri.options = {
  strictMode: false,
  key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
  q:   {
    name:   "queryKey",
    parser: /(?:^|&)([^&=]*)=?([^&]*)/g
  },
  parser: {
    strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
    loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
  }
};

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

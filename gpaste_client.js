const Lang = imports.lang;
const Gio = imports.gi.Gio;
const Signals = imports.signals;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const GPasteIface =
   '<node> \
       <interface name="org.gnome.GPaste"> \
           <method name="GetHistory"> \
               <arg type="as" direction="out" /> \
           </method> \
           <method name="BackupHistory"> \
               <arg type="s" direction="in" /> \
           </method> \
           <method name="SwitchHistory"> \
               <arg type="s" direction="in" /> \
           </method> \
           <method name="DeleteHistory"> \
               <arg type="s" direction="in" /> \
           </method> \
           <method name="ListHistories"> \
               <arg type="as" direction="out" /> \
           </method> \
           <method name="Add"> \
               <arg type="s" direction="in" /> \
           </method> \
           <method name="AddFile"> \
               <arg type="s" direction="in" /> \
           </method> \
           <method name="GetElement"> \
               <arg type="u" direction="in" /> \
               <arg type="s" direction="out" /> \
           </method> \
           <method name="GetRawElement"> \
               <arg type="u" direction="in" /> \
               <arg type="s" direction="out" /> \
           </method> \
           <method name="Select"> \
               <arg type="u" direction="in" /> \
           </method> \
           <method name="Delete"> \
               <arg type="u" direction="in" /> \
           </method> \
           <method name="Empty" /> \
           <method name="Track"> \
               <arg type="b" direction="in" /> \
           </method> \
           <method name="OnExtensionStateChanged"> \
               <arg type="b" direction="in" /> \
           </method> \
           <method name="Reexecute" /> \
           <signal name="ReexecuteSelf" /> \
           <signal name="Tracking"> \
               <arg type="b" direction="out" /> \
           </signal> \
           <signal name="Changed" /> \
           <signal name="NameLost" /> \
           <signal name="ShowHistory" /> \
           <property name="Active" type="b" access="read" /> \
       </interface> \
    </node>';
const GPasteProxy =
    Gio.DBusProxy.makeProxyWrapper(GPasteIface);

const DBUS_NAME = "org.gnome.GPaste";
const DBUS_PATH = "/org/gnome/GPaste";

const GPASTE_SETTINGS_SCHEMA = 'org.gnome.GPaste';
const HISTORY_NAME_KEY = 'history-name';

const GPasteClient = new Lang.Class({
    Name: "GPasteClient",

    _init: function() {
        this._provider = new GPasteProxy(
            Gio.DBus.session,
            DBUS_NAME,
            DBUS_PATH
        );
        this._provider.connectSignal(
            'Changed',
            Lang.bind(this, function(proxy, sender) {
                this.emit('changed');
            })
        );
        this._provider.connectSignal(
            'ShowHistory',
            Lang.bind(this, function(proxy, sender) {
                this.emit('show-history');
            })
        );
        this._provider.connectSignal(
            'Tracking',
            Lang.bind(this, function(proxy, sender, [state]) {
                this.emit('tracking', state);
            })
        );

        this._settings = Utils.getSettings(GPASTE_SETTINGS_SCHEMA);
    },

    _return: function([result], error, method, callback) {
        if(result !== null) {
            if(typeof callback === 'function') callback(result);
        }
        else {
            log("%s: %s".format(method, error));
            if(typeof callback === 'function') callback(null, error);
        }
    },

    get_element: function(index, callback) {
        this._provider.GetElementRemote(index,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'get_element', callback);
            })
        );
    },

    get_raw_element: function(index, callback) {
        this._provider.GetRawElementRemote(index,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'get_raw_element', callback);
            })
        );
    },

    get_history: function(callback) {
        this._provider.GetHistoryRemote(
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'get_history', callback);
            })
        );
    },

    list_histories: function(callback) {
        this._provider.ListHistoriesRemote(
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'list_histories', callback);
            })
        );
    },

    switch_history: function(name, callback) {
        this._provider.SwitchHistoryRemote(name,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'switch_history', callback);
            })
        );
    },

    select: function(index, callback) {
        this._provider.SelectRemote(index,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'select', callback);
            })
        );
    },

    empty: function(callback) {
        this._provider.EmptyRemote(
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'empty', callback);
            })
        );
    },

    delete_sync: function(index) {
        let result = this._provider.DeleteSync(index);
    },

    track: function(state, callback) {
        this._provider.TrackRemote(state,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'track', callback);
            })
        );
    },

    on_extension_state_changed: function(state, callback) {
        this._provider.OnExtensionStateChangedRemote(state,
            Lang.bind(this, function(result, error) {
                this._return(result, error, 'on_extension_state_changed', callback);
            })
        );
    },

    destroy: function() {
        this._provider.run_dispose();
        this.emit('destroy');
    },

    get active() {
        return this._provider.Active;
    },

    get history_name() {
        return this._settings.get_string(HISTORY_NAME_KEY);
    }
});
Signals.addSignalMethods(GPasteClient.prototype);


let _CLIENT = null;

function get_client() {
    if(_CLIENT === null) {
        _CLIENT = new GPasteClient;
        _CLIENT.connect('destroy',
            Lang.bind(this, function() {
                _CLIENT = null;
            })
        );
    }

    return _CLIENT;
}

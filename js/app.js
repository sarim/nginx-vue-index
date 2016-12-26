function PathJoiner(path, name, endSlash) {
    var dir = '';
    dir += path;
    if (!path.endsWith('/')) {
        dir += '/';
    }
    if (endSlash && !name.endsWith('/')) {
        dir += encodeURIComponent(name);
        dir += "/";
    } else if (!endSlash && name.endsWith('/')) {
        dir += encodeURIComponent(name.substring(0, name.length - 1));
    } else if (name != '/') {
        dir += encodeURIComponent(name);
    }
    return dir;
}

Vue.component('node-sort', {
    template: `
        <li class="list-group-item node-sort clearfix">
            <div class="clearfix">
                <div class="col sign" @click="sort.by = null" :class="{'sorted-active': sort.by != null}">
                    <i class="glyphicon glyphicon-refresh"></i>
                </div>
                <div class="col name" @click="toggle('name')" :class="{'sorted-active' : sort.by == 'name'}">
                    <i class="glyphicon" :class="{'glyphicon-arrow-up': sort.asc, 'glyphicon-arrow-down': !sort.asc}"></i>
                    <span>Name</span>
                </div>
                <div class="col size" @click="toggle('size')" :class="{'sorted-active' : sort.by == 'size'}">
                    <i class="glyphicon" :class="{'glyphicon-arrow-up': sort.asc, 'glyphicon-arrow-down': !sort.asc}"></i>
                    <span>Size</span>
                </div>
                <div class="col date" @click="toggle('date')" :class="{'sorted-active' : sort.by == 'date'}">
                    <i class="glyphicon" :class="{'glyphicon-arrow-up': sort.asc, 'glyphicon-arrow-down': !sort.asc}"></i>
                    <span>Date Time</span>
                </div>
            </div>
        </li>
    `,
    data: function() {
        return {
            sort: {
                by: null,
                asc: true
            }
        }
    },
    methods: {
        toggle: function(by) {
            if (by == this.sort.by) {
                this.sort.asc = !this.sort.asc;
            } else {
                this.sort.by = by;
            }
        }
    },
    watch: {
        sort: {
            handler: function() {
                this.$emit('input', this.sort);
            },
            deep: true
        }
    }
});

Vue.component('node-search', {
    template: `
        <div class="node-search" :class="{closed: closed}">
            <div class="input-group input-group-sm">
              <span class="input-group-addon" @click="closed = !closed"><i class="glyphicon glyphicon-search"></i></span>
              <input type="text" class="form-control" placeholder="Search" :value="value" @input="$emit('input', $event.target.value)">
            </div>
        </div>
    `,
    data: function() {
        return {
            closed: true,
        }
    },
    props: ['value']
});

Vue.component('node', {
    template: `
        <li class="list-group-item clearfix">
            <div class="clearfix">
                <div class="col sign">
                    <a @click="toggleExtract" v-if="isDirectory"><i class="glyphicon" :class="extracted ? 'glyphicon-chevron-down' : 'glyphicon-chevron-right' "></i></a>
                </div>
                <div class="col name"><node-search v-show="extracted" v-model="searchText"/><a :href="url" @click="jumpTo">{{ name }}</a></div>
                <div class="col size">{{humanSize}}</div>
                <div class="col date" :title="date">{{date | moment("from")}}</div>
            </div>
            <div v-show="childrenLoading" class="list-group-item loading">
                <i class="glyphicon glyphicon-refresh"></i> Loading ...
            </div>
            <ul class="list-gittu" v-if="extracted">
                <node v-for="child in searchedSortedChildren" :key="url + child.name" :sort="sort" :folder="child" :path="url"/>
            </ul>
        </li>`,
    data: function() {
        return {
            children: [],
            childrenLoading: false,
            searchText: ''
        }
    },
    mounted: function() {
        if (this.root) {
            this.extract();
        }
    },
    props: {
        'folder': Object,
        'sort': Object,
        'root': null,
        'path': {type: String, default: "/"}
    },
    computed: {
        name: function() {
            return this.folder.name;
        },
        isDirectory: function() {
            return (this.folder.type || 'directory') == 'directory';
        },
        date: function() {
            // TODO: Optimize. Parsing with format is very costly. So using `new Date`, but still costly and its behaviour across browsers isn't stable.
            // return moment(this.folder.mtime, 'ddd, DD MMM YYYY HH:mm:ss Z'); //"Tue, 20 Dec 2016 13:10:20 GMT"
            return new Date(this.folder.mtime);
        },
        size: function() {
            return this.folder.size;
        },
        humanSize: function() {
            return this.size ? Humanize.fileSize(this.size) : null;
        },
        url: function() {
            return PathJoiner(this.path, this.name, this.isDirectory);
        },
        extracted: function() {
            return !!(this.children && this.children.length > 0);
        },
        searchedSortedChildren: function() {
            var c;
            var s = this.searchText.trim();
            if (s.length > 1) {
                c = this.children.filter(function(i) {
                    //TODO: Truly fuzzy search. implement complex regex? :P
                    return i.name.match(new RegExp(s,'i')) != null;
                });
            } else {
                c = this.children.slice(0);
            }
            var sort = this.sort;
            if (sort.by) {
                c.sort(function(a,b) {
                    var x,y;
                    if (sort.by == 'name') {
                        x = a.name.toLowerCase();
                        y = b.name.toLowerCase();
                    } else if (sort.by == 'size') {
                        x = a.size;
                        y = b.size;
                    } else if (sort.by == 'date') {
                        //TODO: mtime is string. sort by date unix value,
                        //but don't want to convert it twice (inside component).
                        x = new Date(a.mtime);
                        y = new Date(b.mtime);
                    }
                    return (sort.asc ? (x > y) : (x < y)) ? 1 : -1;
                });
            }
            return c;
        }
    },
    beforeUpdate: function() {
        console.time(this.url);
    },
    updated: function() {
        console.timeEnd(this.url);
    },
    methods: {
        toggleExtract: function() {
            if (this.extracted) {
                this.children = [];
            } else {
                this.extract();
            }
        },
        extract: function() {
            if (!this.name || !this.isDirectory) {
                return;
            }
            var vm = this;
            vm.childrenLoading = true;
            axios.get(this.url + '?j')
            .then(function(response) {
                vm.childrenLoading = false;
                vm.children = response.data;
            })
            .catch(function (error) {
              alert(error);
            });;
        },
        jumpTo: function($e) {
            if (this.isDirectory) {
                $e.preventDefault();
                RootNode.goTo(this.path, this.name);
            }
        }
    },
    watch: {
        url: function() {
            this.children = [];
            if (this.root) {
                this.extract();
            }
        }
    }
});

Vue.component('breadcrumb', {
    template: `
        <ol class="breadcrumb">
            <li v-for="dir in dirs"><a @click="jumpTo(dir)">{{dir.name}}</a></li>
        </ol>`,
    computed: {
        dirs: function() {
            var $paths = this.path == "/" ? [] : this.path.split("/").slice(1, this.path.endsWith('/') ? -1 : undefined);
            if (this.name != "/") {
                $paths.push(this.name);
            }
            $paths.unshift("/");
            var walkedPath = "";
            $paths = $paths.map(function(i) {
                var _path = walkedPath;
                walkedPath = PathJoiner(_path, decodeURIComponent(i));
                return {
                    name: decodeURIComponent(i),
                    path: _path
                }
            });
            return $paths;
        }
    },
    methods: {
        jumpTo: function(dir) {
            RootNode.goTo(dir.path, dir.name);
        }
    },
    props: ['path', 'name']
});

var RootNode = new Vue({
    name: 'RootNode',
    el: "#app",
    template: `
        <div>
            <breadcrumb :path="basePath" :name="folder.name"/>
            <div class="container-fluid">
                <ul class="list-unstyled">
                    <node-sort @input="sort = arguments[0]"/>
                    <node root="true" :sort="sort" :folder="folder" :path="basePath"/>
                </ul>
            </div>
        </div>`,
    created: function() {
        var vm = this;
        vm.setDocTitle();
        window.addEventListener('popstate', function() {
            var $ls = vm.getLocationState();
            vm.goTo($ls.path, $ls.name, true);
        });
    },
    methods: {
        setDocTitle: function() {
            document.title = decodeURIComponent(PathJoiner(this.basePath, this.folder.name));
        },
        goTo: function(path, name, ignorePushState) {
            this.folder.name = name;
            this.basePath = path;
            ignorePushState || history.pushState(null, null, PathJoiner(path, name, true));
            this.setDocTitle();
        },
        getLocationState: function() {
            var $location = location.pathname;
            if ($location == "/") {
                return {
                    name: "/",
                    path: "/"
                }
            } else {
                var $dirs = $location.split("/");
                $dirs.pop();
                var $name = decodeURIComponent($dirs.pop());
            
                return {
                    name: $name,
                    path: $dirs.join("/")
                }
            }
        }
    },
    data: function() {
        var $ls = this.getLocationState();
        return {
            folder: {name: $ls.name},
            basePath: $ls.path,
            sort: {}
        }
    }
})

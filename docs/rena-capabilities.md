# rENA 0.3.0 capability map

All 85 exports are inventoried. A mapped API is not proof of complete parity; see rena-alignment.md and the JSON limitations.

| rENA export | Python API | Status |
|---|---|---|
| `accumulate` | `accumulate` | Experimental |
| `add_group` | `add_group` | Partial |
| `add_network` | `add_network` | Partial |
| `add_nodes` | `add_nodes` | Partial |
| `add_points` | `add_points` | Partial |
| `add_trajectory` | `add_trajectory` | Partial |
| `as_trajectory` | `as_trajectory` | Native implementation |
| `as.ena.co.occurrence` | `as_ena_co_occurrence` | Python equivalent |
| `as.ena.matrix` | `as_ena_matrix` | Python equivalent |
| `as.ena.metadata` | `as_ena_metadata` | Python equivalent |
| `as.qe.code` | `as_qe_code` | Python equivalent |
| `as.qe.data` | `as_qe_data` | Python equivalent |
| `as.qe.horizon` | `as_qe_horizon` | Python equivalent |
| `as.qe.metadata` | `as_qe_metadata` | Python equivalent |
| `as.qe.unit` | `as_qe_unit` | Python equivalent |
| `center` | `center` | Native implementation |
| `check_range` | `check_range` | Partial |
| `clear` | `clear` | Partial |
| `codes` | `codes` | Python equivalent |
| `combn_c2` | `combn_c2` | Native implementation |
| `connection.matrix` | `connection_matrix` | Native implementation |
| `define` | `define` | Python equivalent |
| `directed_node_positions` | `directed_node_positions` | Validated cases |
| `directed_node_positions_with_ground_response_added` | `directed_node_positions_with_ground_response_added` | Validated cases |
| `ena` | `ena` | Validated cases |
| `ena_correlation` | `ena_correlation` | Validated cases |
| `ena.accumulate.data` | `accumulate_data` | Validated cases |
| `ena.conversations` | `ena_conversations` | Native implementation |
| `ena.correlations` | `ena_correlations` | Validated cases |
| `ena.group` | `ena_group` | Validated cases |
| `ena.make.set` | `make_set` | Validated cases |
| `ena.plot` | `ena_plot` | Partial |
| `ena.plot.group` | `add_group` | Partial |
| `ena.plot.network` | `add_network` | Partial |
| `ena.plot.points` | `add_points` | Partial |
| `ena.plot.trajectory` | `add_trajectory` | Partial |
| `ena.plotter` | `ena_plotter` | Partial |
| `ena.rotate.by.generalized` | `generalized_rotation` | Validated cases |
| `ena.rotate.by.hena.regression` | `regression_rotation` | Partial |
| `ena.rotate.by.hena.regression_2` | `regression_rotation` | Partial |
| `ena.rotate.by.mean` | `rotate_by_means` | Validated cases |
| `ena.rotation.h` | `hena_rotation` | Validated cases |
| `ena.svd` | `svd_rotation` | Validated cases |
| `ena.writeup` | `ena_writeup` | Partial |
| `ENAdata` | `ENAData` | Python equivalent |
| `ENAplot` | `ENAPlot` | Python equivalent |
| `ENARotationSet` | `ENARotationSet` | Python equivalent |
| `ENAset` | `ENASet` | Python equivalent |
| `find_binary_cols` | `find_binary_cols` | Python equivalent |
| `find_code_cols` | `find_code_cols` | Python equivalent |
| `find_dimension_cols` | `find_dimension_cols` | Python equivalent |
| `find_meta_cols` | `find_meta_cols` | Python equivalent |
| `fun_cohens.d` | `fun_cohens_d` | Validated cases |
| `fun_skip_sphere_norm` | `fun_skip_sphere_norm` | Validated cases |
| `fun_sphere_norm` | `sphere_normalize` | Validated cases |
| `get_x1_main_effect` | `get_x1_main_effect` | Experimental |
| `gmr` | `gmr` | Validated cases |
| `group` | `ena_plotter` | Partial |
| `horizon` | `horizon` | Python equivalent |
| `is.qe.code` | `is_qe_code` | Python equivalent |
| `is.qe.data` | `is_qe_data` | Python equivalent |
| `is.qe.horizon` | `is_qe_horizon` | Python equivalent |
| `is.qe.metadata` | `is_qe_metadata` | Python equivalent |
| `is.qe.unit` | `is_qe_unit` | Python equivalent |
| `means_rotate` | `means_rotate` | Native implementation |
| `merge_columns_c` | `merge_columns` | Native implementation |
| `metadata` | `metadata` | Python equivalent |
| `methods_report` | `methods_report` | Partial |
| `methods_report_stream` | `methods_report_stream` | Partial |
| `model` | `model` | Native implementation |
| `move_nodes_to_unit_circle` | `move_nodes_to_unit_circle` | Native implementation |
| `move_nodes_to_unit_circle_with_equal_space` | `move_nodes_to_unit_circle_with_equal_space` | Native implementation |
| `namesToAdjacencyKey` | `names_to_adjacency_key` | Native implementation |
| `optimize` | `optimize` | Native implementation |
| `project` | `project` | Native implementation |
| `project_in` | `project_in` | Native implementation |
| `reclassify` | `reclassify` | Python equivalent |
| `remove_meta_data` | `remove_meta_data` | Python equivalent |
| `rotate` | `rotate` | Native implementation |
| `show` | `show` | Partial |
| `sphere_norm` | `sphere_normalize` | Validated cases |
| `units` | `units` | Python equivalent |
| `vector_to_ut` | `vector_to_ut` | Native implementation |
| `with_means` | `with_means` | Partial |
| `with_trajectory` | `with_trajectory` | Partial |
